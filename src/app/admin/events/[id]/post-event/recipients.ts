import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvitationChannel } from '@/types/database';

export interface ThankYouRecipient {
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  channel: 'email' | 'sms';
}

// Resolve + deduplicate the thank-you recipient list for an event.
//
// This is the single source of truth for "who will actually receive a
// message" — the post-event page uses it for the header count, and
// getThankYouPreview / sendThankYouMessages use it to build the preview and
// perform the send. Keeping them on the same resolution guarantees the count
// shown always matches what gets delivered.
//
// Rules:
//   - Only checked-in tickets (people who physically attended).
//   - One message per attendee. Email is the default channel whenever an
//     address exists; otherwise fall back to SMS — but SMS only goes to
//     contacts who consented via sms_opt_in_event_updates (same compliance
//     gate as invitations/waitlist). invitation_channel no longer selects the
//     channel, but 'none' is still honored as a "do not contact" suppression.
//   - Walk-in (contact-less) tickets: email if present, else SMS.
export async function resolveRecipients(
  supabase: SupabaseClient,
  eventId: string
): Promise<ThankYouRecipient[]> {
  const { data: tickets, error } = await supabase
    .from('tickets')
    .select(
      `id, contact_id, attendee_name, attendee_email, attendee_phone,
       contacts (
         id, invitation_channel,
         master_contacts!inner ( first_name, last_name, email, phone, sms_opt_in_event_updates )
       )`
    )
    .eq('event_id', eventId)
    .eq('status', 'checked_in');

  if (error || !tickets) return [];

  const seen = new Map<string, ThankYouRecipient>();

  for (const ticket of tickets) {
    const contact = Array.isArray(ticket.contacts)
      ? ticket.contacts[0]
      : ticket.contacts;

    if (contact) {
      const ch = contact.invitation_channel as InvitationChannel;
      if (ch === 'none') continue;

      const master = Array.isArray(contact.master_contacts)
        ? contact.master_contacts[0]
        : contact.master_contacts;
      const first_name = master?.first_name ?? '';
      const last_name = master?.last_name ?? '';
      const email = master?.email ?? null;
      const phone = master?.phone ?? null;
      const smsOptIn = !!master?.sms_opt_in_event_updates;

      const name = [first_name, last_name]
        .filter(Boolean)
        .join(' ') || 'Guest';

      // Email is the default channel when an address exists; otherwise fall
      // back to SMS, gated on the contact's SMS consent.
      const key = `contact:${contact.id}`;
      if (seen.has(key)) continue;

      if (email) {
        seen.set(key, {
          contactId: contact.id,
          name,
          email,
          phone,
          channel: 'email',
        });
      } else if (phone && smsOptIn) {
        seen.set(key, {
          contactId: contact.id,
          name,
          email: null,
          phone,
          channel: 'sms',
        });
      }
    } else {
      // Orphan ticket (walk-in) — prefer email, fallback SMS
      if (ticket.attendee_email) {
        const key = `email:${ticket.attendee_email.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.set(key, {
          contactId: null,
          name: ticket.attendee_name,
          email: ticket.attendee_email,
          phone: ticket.attendee_phone,
          channel: 'email',
        });
      } else if (ticket.attendee_phone) {
        const key = `phone:${ticket.attendee_phone}`;
        if (seen.has(key)) continue;
        seen.set(key, {
          contactId: null,
          name: ticket.attendee_name,
          email: null,
          phone: ticket.attendee_phone,
          channel: 'sms',
        });
      }
    }
  }

  return Array.from(seen.values());
}
