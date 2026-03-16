'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe';
import { sendEmail } from '@/lib/resend';
import { RsvpConfirmationEmail } from '@/emails/rsvp-confirmation-email';
import { getVenueName } from '@/lib/settings';
import { generateTicketCode, formatDate, getBaseUrl } from '@/lib/utils';
import type { ActionResponse } from '@/types/actions';

const checkoutSchema = z.object({
  event_id: z.string().uuid('Invalid event'),
  items: z
    .array(
      z.object({
        tier_id: z.string().uuid('Invalid tier'),
        quantity: z.number().int().min(0),
      })
    )
    .min(1, 'At least one item is required'),
  attendee_name: z.string().min(1, 'Name is required').max(500),
  attendee_email: z.string().email('A valid email address is required'),
  attendee_phone: z
    .string()
    .max(30, 'Phone number too long')
    .transform((v) => v || null),
  consent_event_updates: z.boolean(),
  consent_marketing: z.boolean(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export async function createCheckoutSession(
  slug: string,
  input: CheckoutInput
): Promise<ActionResponse<{ url: string }>> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { success: false, error: firstError.message };
  }

  const {
    event_id,
    items: rawItems,
    attendee_name,
    attendee_email,
    attendee_phone,
    consent_event_updates,
    consent_marketing,
  } = parsed.data;

  // Filter to items with qty > 0
  const items = rawItems.filter((i) => i.quantity > 0);
  if (items.length === 0) {
    return { success: false, error: 'Please select at least one ticket.' };
  }

  const supabase = await createClient();

  // Verify event exists, is published, and link is active
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, slug, title, date_start, location_name, is_published, link_active')
    .eq('id', event_id)
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('link_active', true)
    .single();

  if (eventError || !event) {
    return { success: false, error: 'Event not found or no longer available.' };
  }

  // Fetch all selected tiers
  const tierIds = items.map((i) => i.tier_id);
  const { data: tiers, error: tiersError } = await supabase
    .from('ticket_tiers')
    .select('id, name, price_cents, quantity_total, quantity_sold, max_per_contact, stripe_price_id')
    .eq('event_id', event_id)
    .in('id', tierIds);

  if (tiersError || !tiers || tiers.length !== tierIds.length) {
    return { success: false, error: 'One or more ticket tiers not found.' };
  }

  // Build a lookup map
  const tierMap = new Map(tiers.map((t) => [t.id, t]));

  // Use service client for all ticket operations (no public RLS policies on tickets)
  const serviceClient = createServiceClient();

  // Validate each item
  for (const item of items) {
    const tier = tierMap.get(item.tier_id);
    if (!tier) {
      return { success: false, error: 'Ticket tier not found.' };
    }

    const remaining = tier.quantity_total - tier.quantity_sold;
    if (remaining <= 0) {
      return { success: false, error: `${tier.name} is sold out.` };
    }
    if (item.quantity > remaining) {
      return {
        success: false,
        error: `Only ${remaining} ticket${remaining === 1 ? '' : 's'} remaining for ${tier.name}.`,
      };
    }

    const maxPerContact = tier.max_per_contact ?? remaining;
    if (item.quantity > maxPerContact) {
      return {
        success: false,
        error: `Maximum ${maxPerContact} ticket${maxPerContact === 1 ? '' : 's'} per person for ${tier.name}.`,
      };
    }

    // Check existing tickets against max_per_contact (use service client — no public SELECT on tickets)
    if (tier.max_per_contact !== null) {
      const { data: existingTickets } = await serviceClient
        .from('tickets')
        .select('quantity')
        .eq('tier_id', tier.id)
        .eq('attendee_email', attendee_email)
        .not('status', 'in', '("cancelled","refunded")');

      const existingQty = existingTickets?.reduce((sum, t) => sum + t.quantity, 0) ?? 0;

      if (existingQty + item.quantity > tier.max_per_contact) {
        const allowed = tier.max_per_contact - existingQty;
        if (allowed <= 0) {
          return {
            success: false,
            error: `You have already reached the maximum of ${tier.max_per_contact} ticket${tier.max_per_contact === 1 ? '' : 's'} for ${tier.name}.`,
          };
        }
        return {
          success: false,
          error: `You can only purchase ${allowed} more ticket${allowed === 1 ? '' : 's'} for ${tier.name}.`,
        };
      }
    }
  }

  // Calculate total
  const totalCents = items.reduce((sum, item) => {
    const tier = tierMap.get(item.tier_id)!;
    return sum + tier.price_cents * item.quantity;
  }, 0);

  // Insert one ticket per item
  const ticketInserts = items.map((item) => ({
    event_id,
    tier_id: item.tier_id,
    contact_id: null,
    attendee_name,
    attendee_email,
    attendee_phone,
    ticket_code: generateTicketCode(),
    quantity: item.quantity,
    amount_paid_cents: 0,
    status: 'pending' as const,
    stripe_payment_intent_id: null,
    stripe_session_id: null,
  }));

  const { data: tickets, error: insertError } = await serviceClient
    .from('tickets')
    .insert(ticketInserts)
    .select('id, tier_id, ticket_code');

  if (insertError || !tickets || tickets.length === 0) {
    return { success: false, error: 'Failed to create tickets. Please try again.' };
  }

  const origin = getBaseUrl();

  let redirectUrl: string;

  if (totalCents > 0) {
    // Build Stripe line items
    const lineItems: import('stripe').Stripe.Checkout.SessionCreateParams.LineItem[] =
      items.map((item) => {
        const tier = tierMap.get(item.tier_id)!;
        if (tier.stripe_price_id) {
          return { price: tier.stripe_price_id, quantity: item.quantity };
        }
        return {
          price_data: {
            currency: 'usd',
            product_data: { name: tier.name },
            unit_amount: tier.price_cents,
          },
          quantity: item.quantity,
        };
      });

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: attendee_email,
        line_items: lineItems,
        metadata: { event_id },
        success_url: `${origin}/e/${slug}/confirm?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/e/${slug}`,
      });
    } catch (err) {
      console.error('Stripe session creation failed:', err);
      // Clean up pending tickets
      await serviceClient
        .from('tickets')
        .delete()
        .in('id', tickets.map((t) => t.id));
      return { success: false, error: 'Failed to start checkout. Please try again.' };
    }

    // Store stripe_session_id on all tickets
    await serviceClient
      .from('tickets')
      .update({ stripe_session_id: session.id })
      .in('id', tickets.map((t) => t.id));

    if (!session.url) {
      return { success: false, error: 'Failed to get checkout URL. Please try again.' };
    }

    redirectUrl = session.url;
  } else {
    // Free-only: confirm tickets immediately
    const syntheticSessionId = `free_${randomUUID()}`;

    await serviceClient
      .from('tickets')
      .update({
        status: 'confirmed',
        stripe_session_id: syntheticSessionId,
      })
      .in('id', tickets.map((t) => t.id));

    // Adjust quantity_sold for each tier
    for (const item of items) {
      const { error: rpcError } = await serviceClient.rpc('adjust_quantity_sold', {
        p_tier_id: item.tier_id,
        p_delta: item.quantity,
      });
      if (rpcError) {
        console.error('Failed to increment quantity_sold:', rpcError.message);
      }
    }

    // Send RSVP confirmation email
    if (attendee_email) {
      const venueName = await getVenueName();
      const dateFormatted = formatDate(event.date_start, 'EEEE, MMMM d, yyyy · h:mm a');
      const ticketsList = tickets.map((t) => {
        const tier = tierMap.get(t.tier_id)!;
        const item = items.find((i) => i.tier_id === t.tier_id)!;
        return {
          tierName: tier.name,
          quantity: item.quantity,
          ticketCode: t.ticket_code,
        };
      });
      sendEmail({
        to: attendee_email,
        subject: `RSVP Confirmed: ${event.title}`,
        react: RsvpConfirmationEmail({
          attendeeName: attendee_name,
          eventTitle: event.title,
          dateFormatted,
          locationName: event.location_name,
          tickets: ticketsList,
          venueName,
        }),
      }).catch((err) => {
        console.error('Failed to send RSVP confirmation email:', err);
      });
    }

    redirectUrl = `${origin}/e/${slug}/confirm?session_id=${syntheticSessionId}`;
  }

  // Create contact record if opted in to event updates
  if (consent_event_updates) {
    const nameParts = attendee_name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? null;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    // Dedup by email
    const { data: existingContact } = await serviceClient
      .from('contacts')
      .select('id')
      .eq('event_id', event_id)
      .eq('email', attendee_email)
      .maybeSingle();

    if (!existingContact) {
      await serviceClient.from('contacts').insert({
        event_id,
        first_name: firstName,
        last_name: lastName,
        email: attendee_email,
        phone: attendee_phone,
        invitation_channel: 'none',
      });
    }
  }

  // Record SMS consents if phone provided and at least one consent is true
  if (attendee_phone && (consent_event_updates || consent_marketing)) {
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      headersList.get('x-real-ip') ??
      'unknown';

    const consentRecords: Array<{
      phone: string;
      consent_type: string;
      consent_text: string;
      ip_address: string;
      event_id: string;
    }> = [];

    if (consent_event_updates) {
      consentRecords.push({
        phone: attendee_phone,
        consent_type: 'event_updates',
        consent_text: 'I agree to receive text messages about this event',
        ip_address: ipAddress,
        event_id,
      });
    }

    if (consent_marketing) {
      const vName = await getVenueName();
      consentRecords.push({
        phone: attendee_phone,
        consent_type: 'marketing',
        consent_text:
          `I agree to receive text messages about future events from ${vName}`,
        ip_address: ipAddress,
        event_id,
      });
    }

    await serviceClient.from('sms_consents').insert(consentRecords);
  }

  return { success: true, data: { url: redirectUrl } };
}
