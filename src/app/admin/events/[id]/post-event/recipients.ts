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
// Rules: only confirmed/checked-in tickets; deduplicated per contact+channel;
// invitation_channel controls channels ('none' skipped, 'both' yields two
// recipients); walk-in (contact-less) tickets fall back to email then SMS.
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
         master_contacts!inner ( first_name, last_name, email, phone )
       )`
    )
    .eq('event_id', eventId)
    .in('status', ['confirmed', 'checked_in']);

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

      const name = [first_name, last_name]
        .filter(Boolean)
        .join(' ') || 'Guest';

      // Send to each channel matching the contact's invitation_channel
      if ((ch === 'email' || ch === 'both') && email) {
        const key = `contact:${contact.id}:email`;
        if (!seen.has(key)) {
          seen.set(key, {
            contactId: contact.id,
            name,
            email,
            phone,
            channel: 'email',
          });
        }
      }

      if ((ch === 'sms' || ch === 'both') && phone) {
        const key = `contact:${contact.id}:sms`;
        if (!seen.has(key)) {
          seen.set(key, {
            contactId: contact.id,
            name,
            email,
            phone,
            channel: 'sms',
          });
        }
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
