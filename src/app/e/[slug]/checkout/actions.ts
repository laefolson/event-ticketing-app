'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe';
import type { ActionResponse } from '@/types/actions';

const checkoutSchema = z.object({
  event_id: z.string().uuid('Invalid event'),
  tier_id: z.string().uuid('Invalid tier'),
  attendee_name: z.string().min(1, 'Name is required').max(500),
  attendee_email: z.string().email('A valid email address is required'),
  attendee_phone: z
    .string()
    .max(30, 'Phone number too long')
    .transform((v) => v || null),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
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

  const { event_id, tier_id, attendee_name, attendee_email, attendee_phone, quantity } =
    parsed.data;

  const supabase = await createClient();

  // Verify event exists, is published, and link is active
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, slug, is_published, link_active')
    .eq('id', event_id)
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('link_active', true)
    .single();

  if (eventError || !event) {
    return { success: false, error: 'Event not found or no longer available.' };
  }

  // Verify tier exists, belongs to event, and is paid
  const { data: tier, error: tierError } = await supabase
    .from('ticket_tiers')
    .select('id, name, price_cents, quantity_total, quantity_sold, max_per_contact, stripe_price_id')
    .eq('id', tier_id)
    .eq('event_id', event_id)
    .single();

  if (tierError || !tier) {
    return { success: false, error: 'Ticket tier not found.' };
  }

  if (tier.price_cents <= 0) {
    return { success: false, error: 'This tier is free. Please use RSVP instead.' };
  }

  // Check availability
  const remaining = tier.quantity_total - tier.quantity_sold;
  if (remaining <= 0) {
    return { success: false, error: 'This tier is sold out.' };
  }

  if (quantity > remaining) {
    return {
      success: false,
      error: `Only ${remaining} ticket${remaining === 1 ? '' : 's'} remaining.`,
    };
  }

  // Check max_per_contact limit (includes pending tickets)
  if (tier.max_per_contact !== null) {
    const { data: existingTickets } = await supabase
      .from('tickets')
      .select('quantity')
      .eq('tier_id', tier_id)
      .eq('attendee_email', attendee_email)
      .not('status', 'in', '("cancelled","refunded")');

    const existingQty = existingTickets?.reduce((sum, t) => sum + t.quantity, 0) ?? 0;

    if (existingQty + quantity > tier.max_per_contact) {
      const allowed = tier.max_per_contact - existingQty;
      if (allowed <= 0) {
        return {
          success: false,
          error: `You have already reached the maximum of ${tier.max_per_contact} ticket${tier.max_per_contact === 1 ? '' : 's'} for this tier.`,
        };
      }
      return {
        success: false,
        error: `You can only purchase ${allowed} more ticket${allowed === 1 ? '' : 's'} for this tier.`,
      };
    }
  }

  // Insert pending ticket
  const { data: ticket, error: insertError } = await supabase
    .from('tickets')
    .insert({
      event_id,
      tier_id,
      contact_id: null,
      attendee_name,
      attendee_email,
      attendee_phone,
      quantity,
      amount_paid_cents: 0,
      status: 'pending',
      stripe_payment_intent_id: null,
      stripe_session_id: null,
    })
    .select('id')
    .single();

  if (insertError) {
    return { success: false, error: 'Failed to create ticket. Please try again.' };
  }

  // Build line item
  const lineItem: import('stripe').Stripe.Checkout.SessionCreateParams.LineItem = tier.stripe_price_id
    ? { price: tier.stripe_price_id, quantity }
    : {
        price_data: {
          currency: 'usd',
          product_data: { name: tier.name },
          unit_amount: tier.price_cents,
        },
        quantity,
      };

  // Create Stripe Checkout Session
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: attendee_email,
      line_items: [lineItem],
      metadata: {
        event_id,
        tier_id,
        ticket_id: ticket.id,
      },
      success_url: `${origin}/e/${slug}/confirm?ticket_id=${ticket.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/e/${slug}`,
    });
  } catch (err) {
    console.error('Stripe session creation failed:', err);
    return { success: false, error: 'Failed to start checkout. Please try again.' };
  }

  // Store stripe_session_id on the ticket
  const serviceClient = createServiceClient();
  await serviceClient
    .from('tickets')
    .update({ stripe_session_id: session.id })
    .eq('id', ticket.id);

  if (!session.url) {
    return { success: false, error: 'Failed to get checkout URL. Please try again.' };
  }

  return { success: true, data: { url: session.url } };
}
