'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/types/actions';

const walkInSchema = z.object({
  tier_id: z.string().uuid('Invalid tier'),
  attendee_name: z.string().min(1, 'Name is required').max(500),
  attendee_email: z
    .string()
    .email('Invalid email address')
    .nullable()
    .transform((v) => v || null),
  attendee_phone: z
    .string()
    .max(30, 'Phone number too long')
    .nullable()
    .transform((v) => v || null),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});

export type WalkInInput = z.infer<typeof walkInSchema>;

export async function createWalkIn(
  eventId: string,
  input: WalkInInput
): Promise<ActionResponse<{ ticketId: string }>> {
  const parsed = walkInSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { success: false, error: firstError.message };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  // Verify tier belongs to this event
  const { data: tier, error: tierError } = await supabase
    .from('ticket_tiers')
    .select('id')
    .eq('id', parsed.data.tier_id)
    .eq('event_id', eventId)
    .single();

  if (tierError || !tier) {
    return { success: false, error: 'Tier not found for this event.' };
  }

  // Insert ticket with confirmed status, $0 walk-in
  const { data: ticket, error: insertError } = await supabase
    .from('tickets')
    .insert({
      event_id: eventId,
      tier_id: parsed.data.tier_id,
      contact_id: null,
      attendee_name: parsed.data.attendee_name,
      attendee_email: parsed.data.attendee_email,
      attendee_phone: parsed.data.attendee_phone,
      quantity: parsed.data.quantity,
      amount_paid_cents: 0,
      status: 'confirmed',
      stripe_payment_intent_id: null,
      stripe_session_id: null,
    })
    .select('id')
    .single();

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  // Atomically increment quantity_sold on the tier
  const { error: rpcError } = await supabase
    .rpc('adjust_quantity_sold', { p_tier_id: tier.id, p_delta: parsed.data.quantity });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  return { success: true, data: { ticketId: ticket.id } };
}

const toggleSchema = z.object({
  ticketId: z.string().uuid('Invalid ticket ID'),
  newStatus: z.enum(['confirmed', 'checked_in']),
});

export async function toggleCheckIn(
  ticketId: string,
  newStatus: 'confirmed' | 'checked_in'
): Promise<ActionResponse> {
  const parsed = toggleSchema.safeParse({ ticketId, newStatus });
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { success: false, error: firstError.message };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  // Verify ticket exists and is in a toggleable status
  const { data: ticket, error: fetchError } = await supabase
    .from('tickets')
    .select('id, status')
    .eq('id', parsed.data.ticketId)
    .single();

  if (fetchError || !ticket) {
    return { success: false, error: 'Ticket not found.' };
  }

  if (ticket.status !== 'confirmed' && ticket.status !== 'checked_in') {
    return { success: false, error: 'Ticket cannot be toggled in its current status.' };
  }

  const updateData =
    parsed.data.newStatus === 'checked_in'
      ? { status: 'checked_in' as const, checked_in_at: new Date().toISOString() }
      : { status: 'confirmed' as const, checked_in_at: null };

  const { error: updateError } = await supabase
    .from('tickets')
    .update(updateData)
    .eq('id', parsed.data.ticketId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}
