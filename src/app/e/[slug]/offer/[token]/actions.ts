'use server';

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { isValidPhone, normalizePhone, PHONE_VALIDATION_MESSAGE } from '@/lib/phone';
import { stripe } from '@/lib/stripe';
import { generateTicketCode, getBaseUrl } from '@/lib/utils';
import { syncMasterContactFromCheckout } from '@/lib/checkout-master-sync';
import { computeServiceFeeCents } from '@/lib/service-fee';
import type { ActionResponse } from '@/types/actions';

const acceptOfferSchema = z.object({
  attendee_name: z.string().min(1).max(500),
  attendee_email: z.string().email('A valid email address is required'),
  attendee_phone: z
    .string()
    .max(30)
    .refine((v) => isValidPhone(v), PHONE_VALIDATION_MESSAGE)
    .transform((v) => v || null),
  payment_method: z.enum(['stripe', 'venmo']).default('stripe'),
});

export type AcceptOfferInput = z.infer<typeof acceptOfferSchema>;

export async function acceptWaitlistOffer(
  slug: string,
  token: string,
  input: AcceptOfferInput
): Promise<ActionResponse<{ url: string }>> {
  const parsed = acceptOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const {
    attendee_name,
    attendee_email,
    attendee_phone: rawPhone,
    payment_method,
  } = parsed.data;
  const attendee_phone = normalizePhone(rawPhone);

  const service = createServiceClient();

  const { data: entry, error: entryErr } = await service
    .from('waitlist_entries')
    .select(
      'id, event_id, master_contact_id, tier_id, tickets_offered, status, offer_expires_at'
    )
    .eq('offer_token', token)
    .single();

  if (entryErr || !entry) {
    return { success: false, error: 'Offer not found.' };
  }
  if (entry.status !== 'offered') {
    return { success: false, error: 'This offer is no longer active.' };
  }
  if (!entry.offer_expires_at || new Date(entry.offer_expires_at) < new Date()) {
    return { success: false, error: 'This offer has expired.' };
  }
  if (!entry.tier_id || !entry.tickets_offered) {
    return { success: false, error: 'Offer is missing tier or quantity.' };
  }

  const { data: event } = await service
    .from('events')
    .select('id, slug, title, venmo_enabled, pass_service_fee')
    .eq('id', entry.event_id)
    .eq('slug', slug)
    .single();
  if (!event) {
    return { success: false, error: 'Event not found.' };
  }
  if (payment_method === 'venmo' && !event.venmo_enabled) {
    return { success: false, error: 'Venmo is not enabled for this event.' };
  }

  const { data: tier } = await service
    .from('ticket_tiers')
    .select('id, name, price_cents, stripe_price_id')
    .eq('id', entry.tier_id)
    .single();
  if (!tier) {
    return { success: false, error: 'Ticket tier not found.' };
  }

  const subtotalCents = tier.price_cents * entry.tickets_offered;
  const serviceFeeCents =
    payment_method === 'stripe' && event.pass_service_fee && subtotalCents > 0
      ? computeServiceFeeCents(subtotalCents)
      : 0;
  const totalCents = subtotalCents + serviceFeeCents;

  // Insert a single ticket row for the bundle (mirrors the checkout
  // shape: one ticket per "line item"). Waitlist offers are a single
  // tier so one row with quantity = tickets_offered is correct.
  const ticketCode = generateTicketCode();
  const { data: insertedTicket, error: ticketErr } = await service
    .from('tickets')
    .insert({
      event_id: entry.event_id,
      tier_id: tier.id,
      contact_id: null,
      attendee_name,
      attendee_email,
      attendee_phone,
      ticket_code: ticketCode,
      quantity: entry.tickets_offered,
      amount_paid_cents: 0,
      service_fee_cents: serviceFeeCents,
      status: 'pending' as const,
      stripe_payment_intent_id: null,
      stripe_session_id: null,
      payment_method,
      source: 'waitlist',
    })
    .select('id')
    .single();
  if (ticketErr || !insertedTicket) {
    return { success: false, error: ticketErr?.message ?? 'Failed to create ticket.' };
  }

  // Master-sync the attendee so the contacts join row exists when the
  // confirmation flow runs.
  try {
    await syncMasterContactFromCheckout(service, {
      eventId: entry.event_id,
      email: attendee_email,
      name: attendee_name,
      phone: attendee_phone,
      smsOptInEvent: false,
      smsOptInMarketing: false,
      source: 'checkout',
      addedBy: 'checkout',
    });
  } catch (err) {
    console.error('acceptWaitlistOffer master sync failed:', err);
  }

  const origin = getBaseUrl();
  let redirectUrl: string;

  if (payment_method === 'venmo') {
    const syntheticSessionId = `venmo_${randomUUID()}`;
    await service
      .from('tickets')
      .update({
        stripe_session_id: syntheticSessionId,
        amount_paid_cents: subtotalCents,
      })
      .eq('id', insertedTicket.id);
    // Venmo carries no service fee — overwrite to be safe even though
    // we set it to 0 above.
    await service
      .from('tickets')
      .update({ service_fee_cents: 0 })
      .eq('id', insertedTicket.id);
    // Mark offer accepted — actual purchase confirmation happens when
    // admin verifies Venmo payment. The waitlist row stays 'offered'
    // until then so the admin can still cancel.
    redirectUrl = `${origin}/e/${slug}/venmo-pending?session_id=${syntheticSessionId}`;
  } else {
    const lineItems: import('stripe').Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    if (tier.stripe_price_id) {
      lineItems.push({ price: tier.stripe_price_id, quantity: entry.tickets_offered });
    } else {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: tier.name },
          unit_amount: tier.price_cents,
        },
        quantity: entry.tickets_offered,
      });
    }
    if (serviceFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Card Surcharge' },
          unit_amount: serviceFeeCents,
        },
        quantity: 1,
      });
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: attendee_email,
        line_items: lineItems,
        metadata: {
          event_id: entry.event_id,
          waitlist_entry_id: entry.id,
          sms_opt_in_event_updates: '0',
          sms_opt_in_marketing: '0',
        },
        success_url: `${origin}/e/${slug}/confirm?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/e/${slug}/offer/${token}`,
      });
    } catch (err) {
      console.error('acceptWaitlistOffer stripe session failed:', err);
      await service.from('tickets').delete().eq('id', insertedTicket.id);
      return { success: false, error: 'Failed to start checkout. Please try again.' };
    }
    await service
      .from('tickets')
      .update({ stripe_session_id: session.id })
      .eq('id', insertedTicket.id);
    if (!session.url) {
      return { success: false, error: 'Failed to get checkout URL.' };
    }
    redirectUrl = session.url;
    // Mark the offer as purchased once the buyer is redirected into
    // Stripe — the Stripe webhook will confirm the actual ticket on
    // payment success. We tag the waitlist entry now (rather than
    // waiting on the webhook) so the admin sees motion immediately;
    // if Stripe fails the buyer can retry from /offer/[token].
    void service
      .from('waitlist_entries')
      .update({ status: 'purchased', purchased_at: new Date().toISOString() })
      .eq('id', entry.id);
  }

  return { success: true, data: { url: redirectUrl } };
}

export async function declineWaitlistOffer(
  token: string
): Promise<ActionResponse<{ ok: true }>> {
  if (!token) {
    return { success: false, error: 'Missing token.' };
  }
  const service = createServiceClient();

  const { data: entry, error: entryErr } = await service
    .from('waitlist_entries')
    .select('id, status')
    .eq('offer_token', token)
    .single();
  if (entryErr || !entry) {
    return { success: false, error: 'Offer not found.' };
  }
  if (entry.status !== 'offered') {
    // Idempotent — if already declined just say so.
    return { success: true, data: { ok: true } };
  }
  const { error: updateErr } = await service
    .from('waitlist_entries')
    .update({ status: 'declined' })
    .eq('id', entry.id);
  if (updateErr) {
    return { success: false, error: updateErr.message };
  }
  return { success: true, data: { ok: true } };
}
