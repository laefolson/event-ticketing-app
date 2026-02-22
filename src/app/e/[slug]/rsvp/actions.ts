'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { ActionResponse } from '@/types/actions';

const rsvpSchema = z.object({
  event_id: z.string().uuid('Invalid event'),
  tier_id: z.string().uuid('Invalid tier'),
  attendee_name: z.string().min(1, 'Name is required').max(500),
  attendee_email: z
    .string()
    .email('Invalid email address')
    .or(z.literal(''))
    .transform((v) => v || null),
  attendee_phone: z
    .string()
    .max(30, 'Phone number too long')
    .transform((v) => v || null),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});

export type RsvpInput = z.infer<typeof rsvpSchema>;

export async function submitRsvp(
  slug: string,
  input: RsvpInput
): Promise<ActionResponse<{ ticketId: string }>> {
  const parsed = rsvpSchema.safeParse(input);
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

  // Verify tier exists, belongs to event, and is free
  const { data: tier, error: tierError } = await supabase
    .from('ticket_tiers')
    .select('id, price_cents, quantity_total, quantity_sold, max_per_contact')
    .eq('id', tier_id)
    .eq('event_id', event_id)
    .single();

  if (tierError || !tier) {
    return { success: false, error: 'Ticket tier not found.' };
  }

  if (tier.price_cents !== 0) {
    return { success: false, error: 'This tier is not free. Please use checkout instead.' };
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

  // Check max_per_contact limit
  if (tier.max_per_contact !== null && (attendee_email || attendee_phone)) {
    let query = supabase
      .from('tickets')
      .select('quantity')
      .eq('tier_id', tier_id)
      .not('status', 'in', '("cancelled","refunded")');

    if (attendee_email) {
      query = query.eq('attendee_email', attendee_email);
    } else {
      query = query.eq('attendee_phone', attendee_phone!);
    }

    const { data: existingTickets } = await query;
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
        error: `You can only reserve ${allowed} more ticket${allowed === 1 ? '' : 's'} for this tier.`,
      };
    }
  }

  // Insert ticket via anon client (RLS allows insert for public)
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
      status: 'confirmed',
      stripe_payment_intent_id: null,
      stripe_session_id: null,
    })
    .select('id')
    .single();

  if (insertError) {
    return { success: false, error: 'Failed to create ticket. Please try again.' };
  }

  // Increment quantity_sold via service role client (bypasses RLS)
  const serviceClient = createServiceClient();
  const { error: updateError } = await serviceClient
    .from('ticket_tiers')
    .update({ quantity_sold: tier.quantity_sold + quantity })
    .eq('id', tier.id);

  if (updateError) {
    // Ticket already inserted — log but don't fail the user
    console.error('Failed to increment quantity_sold:', updateError.message);
  }

  return { success: true, data: { ticketId: ticket.id } };
}
