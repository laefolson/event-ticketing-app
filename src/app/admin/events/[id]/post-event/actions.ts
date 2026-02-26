'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/resend';
import { sendSms } from '@/lib/twilio';
import { ThankYouEmail } from '@/emails/thank-you-email';
import type { ActionResponse } from '@/types/actions';
import type { InvitationChannel } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ───────────────────────────────────────────────────────────────

interface ThankYouRecipient {
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  channel: 'email' | 'sms';
}

export interface RecipientPreview {
  recipients: ThankYouRecipient[];
  emailCount: number;
  smsCount: number;
  alreadySent: boolean;
}

export interface SendResult {
  sent: number;
  failed: number;
  failedDetails: string[];
}

// ── Internal helper: resolve + deduplicate recipients ───────────────────

async function resolveRecipients(
  supabase: SupabaseClient,
  eventId: string
): Promise<ThankYouRecipient[]> {
  const { data: tickets, error } = await supabase
    .from('tickets')
    .select(
      `id, contact_id, attendee_name, attendee_email, attendee_phone,
       contacts ( id, first_name, last_name, email, phone, invitation_channel )`
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
      const key = `contact:${contact.id}`;
      if (seen.has(key)) continue;

      const ch = contact.invitation_channel as InvitationChannel;
      if (ch === 'none') continue;

      // For 'both', send email only to avoid duplicates
      const channel: 'email' | 'sms' =
        ch === 'sms' ? 'sms' : 'email';

      const addr = channel === 'email' ? contact.email : contact.phone;
      if (!addr) continue;

      const name = [contact.first_name, contact.last_name]
        .filter(Boolean)
        .join(' ') || 'Guest';

      seen.set(key, {
        contactId: contact.id,
        name,
        email: contact.email,
        phone: contact.phone,
        channel,
      });
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

// ── getThankYouPreview ──────────────────────────────────────────────────

export async function getThankYouPreview(
  eventId: string
): Promise<ActionResponse<RecipientPreview>> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  // Verify event exists and has ended
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, date_end')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return { success: false, error: 'Event not found.' };
  }

  if (new Date(event.date_end) > new Date()) {
    return { success: false, error: 'Event has not ended yet.' };
  }

  // Check if already sent
  const { count: sentCount } = await supabase
    .from('invitation_logs')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('message_type', 'thank_you');

  const recipients = await resolveRecipients(supabase, eventId);

  const emailCount = recipients.filter((r) => r.channel === 'email').length;
  const smsCount = recipients.filter((r) => r.channel === 'sms').length;

  return {
    success: true,
    data: {
      recipients,
      emailCount,
      smsCount,
      alreadySent: (sentCount ?? 0) > 0,
    },
  };
}

// ── sendThankYouMessages ────────────────────────────────────────────────

const sendSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  emailBody: z.string().min(1, 'Email body is required').max(5000),
  force: z.boolean().optional(),
});

export type SendThankYouInput = z.infer<typeof sendSchema>;

export async function sendThankYouMessages(
  input: SendThankYouInput
): Promise<ActionResponse<SendResult>> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { success: false, error: firstError.message };
  }

  const { eventId, emailBody, force } = parsed.data;

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  // Verify event exists and has ended
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, date_end')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return { success: false, error: 'Event not found.' };
  }

  if (new Date(event.date_end) > new Date()) {
    return { success: false, error: 'Event has not ended yet.' };
  }

  // Check if already sent
  if (!force) {
    const { count: sentCount } = await supabase
      .from('invitation_logs')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('message_type', 'thank_you');

    if ((sentCount ?? 0) > 0) {
      return {
        success: false,
        error:
          'Thank-you messages have already been sent. Use "Send Again" to resend.',
      };
    }
  }

  const recipients = await resolveRecipients(supabase, eventId);

  let sent = 0;
  let failed = 0;
  const failedDetails: string[] = [];

  const emailSubject = `Thank you for attending ${event.title}!`;
  const smsBody = `Thank you for attending ${event.title}! Hope to see you next time.`;

  for (const recipient of recipients) {
    let result: { success: boolean; messageId?: string; error?: string };

    if (recipient.channel === 'email' && recipient.email) {
      result = await sendEmail({
        to: recipient.email,
        subject: emailSubject,
        react: ThankYouEmail({
          firstName: recipient.name.split(' ')[0] || 'Guest',
          eventTitle: event.title,
          customBody: emailBody,
        }),
      });
    } else if (recipient.channel === 'sms' && recipient.phone) {
      result = await sendSms({
        to: recipient.phone,
        body: smsBody,
      });
    } else {
      failed++;
      failedDetails.push(`${recipient.name}: no valid ${recipient.channel} address`);
      continue;
    }

    // Log to invitation_logs
    await supabase.from('invitation_logs').insert({
      event_id: eventId,
      contact_id: recipient.contactId,
      message_type: 'thank_you',
      channel: recipient.channel,
      status: result.success ? 'sent' : 'failed',
      provider_message_id: result.messageId ?? null,
    });

    if (result.success) {
      sent++;
    } else {
      failed++;
      failedDetails.push(`${recipient.name}: ${result.error}`);
    }
  }

  return { success: true, data: { sent, failed, failedDetails } };
}

// ── archiveEvent ────────────────────────────────────────────────────────

export async function archiveEvent(
  eventId: string
): Promise<ActionResponse> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const { error: updateError } = await supabase
    .from('events')
    .update({
      status: 'archived',
      link_active: false,
      archived_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}

// ── unarchiveEvent ──────────────────────────────────────────────────────

export async function unarchiveEvent(
  eventId: string
): Promise<ActionResponse> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const { error: updateError } = await supabase
    .from('events')
    .update({
      status: 'published',
      link_active: true,
      archived_at: null,
    })
    .eq('id', eventId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}
