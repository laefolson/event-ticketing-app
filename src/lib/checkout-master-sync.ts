// Shared logic for syncing master_contacts (and the per-event contacts join
// row) when a guest completes a paid checkout or free RSVP. Used by both the
// Stripe webhook handler and the RSVP server action.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContactSource, ContactAddedBy, InvitationChannel } from '@/types/database';
import { normalizePhone } from '@/lib/phone';

export interface CheckoutSyncInput {
  eventId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  smsOptInEvent?: boolean;
  smsOptInMarketing?: boolean;
  /** New-master-only: which source label to record. */
  source: Extract<ContactSource, 'checkout' | 'rsvp'>;
  /** Per-event join row source label. */
  addedBy: Extract<ContactAddedBy, 'checkout' | 'rsvp'>;
  /** Override channel used on the contacts join row. Defaults to 'both' if a phone is present, otherwise 'email'. */
  invitationChannel?: InvitationChannel;
}

export interface CheckoutSyncResult {
  masterContactId: string;
  wasNewMaster: boolean;
  contactRowCreated: boolean;
}

function splitName(name?: string | null): { first: string; last: string } {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return { first: '', last: '' };
  const parts = trimmed.split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export async function syncMasterContactFromCheckout(
  supabase: SupabaseClient,
  input: CheckoutSyncInput
): Promise<CheckoutSyncResult> {
  const email = (input.email ?? '').trim().toLowerCase();
  if (!email) throw new Error('email is required');
  const phone = normalizePhone(input.phone);
  const { first, last } = splitName(input.name);
  const smsEvent = Boolean(input.smsOptInEvent);
  const smsMarketing = Boolean(input.smsOptInMarketing);

  // 1. Look up existing master_contact by lowercased email.
  const { data: existing, error: fetchErr } = await supabase
    .from('master_contacts')
    .select(
      'id, first_name, last_name, phone, sms_opt_in_event_updates, sms_opt_in_marketing'
    )
    .eq('email', email)
    .maybeSingle();
  if (fetchErr) throw new Error(`Failed to query master_contacts: ${fetchErr.message}`);

  let masterContactId: string;
  let wasNewMaster = false;

  if (!existing) {
    const { data: inserted, error: insertErr } = await supabase
      .from('master_contacts')
      .insert({
        first_name: first,
        last_name: last,
        email,
        phone,
        sms_opt_in_event_updates: smsEvent,
        sms_opt_in_marketing: smsMarketing,
        source: input.source,
      })
      .select('id')
      .single();
    if (insertErr) throw new Error(`Failed to insert master_contact: ${insertErr.message}`);
    masterContactId = inserted.id as string;
    wasNewMaster = true;
  } else {
    // Conditional update: fill blanks for name, phone is source-of-truth when
    // provided and different, opt-ins are upgraded but never downgraded.
    const fields: Record<string, unknown> = {};
    if (!existing.first_name && first) fields.first_name = first;
    if (!existing.last_name && last) fields.last_name = last;
    if (phone && phone !== existing.phone) fields.phone = phone;
    if (smsEvent && !existing.sms_opt_in_event_updates) fields.sms_opt_in_event_updates = true;
    if (smsMarketing && !existing.sms_opt_in_marketing) fields.sms_opt_in_marketing = true;
    if (Object.keys(fields).length > 0) {
      const { error: updateErr } = await supabase
        .from('master_contacts')
        .update(fields)
        .eq('id', existing.id);
      if (updateErr) throw new Error(`Failed to update master_contact: ${updateErr.message}`);
    }
    masterContactId = existing.id as string;
  }

  // 2. Check whether a contacts join row already exists for this event.
  const { data: existingJoin, error: joinFetchErr } = await supabase
    .from('contacts')
    .select('id')
    .eq('event_id', input.eventId)
    .eq('master_contact_id', masterContactId)
    .maybeSingle();
  if (joinFetchErr) throw new Error(`Failed to query contacts: ${joinFetchErr.message}`);

  if (existingJoin) {
    return { masterContactId, wasNewMaster, contactRowCreated: false };
  }

  // 3. Create the contacts join row. Default channel is opt-in-aware: we'll
  // only SMS people for this event if they explicitly opted in AND gave us a
  // phone. Otherwise stay on email so we never message someone who didn't
  // agree to it.
  const channel: InvitationChannel = input.invitationChannel
    ?? (smsEvent && phone ? 'both' : 'email');
  const { error: joinInsertErr } = await supabase.from('contacts').insert({
    event_id: input.eventId,
    master_contact_id: masterContactId,
    added_by: input.addedBy,
    invitation_channel: channel,
  });
  if (joinInsertErr) {
    throw new Error(`Failed to create contacts join row: ${joinInsertErr.message}`);
  }

  return { masterContactId, wasNewMaster, contactRowCreated: true };
}
