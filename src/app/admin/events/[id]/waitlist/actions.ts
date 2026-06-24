'use server';

import { z } from 'zod';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sendEmail } from '@/lib/resend';
import { sendSms } from '@/lib/twilio';
import { WaitlistOfferEmail } from '@/emails/waitlist-offer-email';
import { WaitlistCustomEmail } from '@/emails/waitlist-custom-email';
import { getVenueName } from '@/lib/settings';
import { formatDate, getBaseUrl } from '@/lib/utils';
import type { ActionResponse } from '@/types/actions';

// ── Send Offer ──────────────────────────────────────────────────────────

const sendOfferSchema = z.object({
  entryId: z.string().uuid(),
  eventId: z.string().uuid(),
  tierId: z.string().uuid(),
  ticketsOffered: z.number().int().min(1).max(50),
  holdHours: z.number().int().min(1).max(720),
});
export type SendOfferInput = z.infer<typeof sendOfferSchema>;

function generateOfferToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function sendWaitlistOffer(
  input: SendOfferInput
): Promise<ActionResponse<{ token: string }>> {
  const parsed = sendOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { entryId, eventId, tierId, ticketsOffered, holdHours } = parsed.data;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const service = createServiceClient();

  const { data: entry, error: entryErr } = await service
    .from('waitlist_entries')
    .select('id, event_id, master_contact_id, status')
    .eq('id', entryId)
    .single();
  if (entryErr || !entry) {
    return { success: false, error: 'Waitlist entry not found.' };
  }
  if (entry.event_id !== eventId) {
    return { success: false, error: 'Entry does not belong to this event.' };
  }
  if (entry.status === 'purchased') {
    return { success: false, error: 'This entry has already purchased tickets.' };
  }

  const { data: event } = await service
    .from('events')
    .select('id, slug, title, date_start, location_name')
    .eq('id', eventId)
    .single();
  if (!event) return { success: false, error: 'Event not found.' };

  const { data: master } = await service
    .from('master_contacts')
    .select('first_name, last_name, email, phone, sms_opt_in_event_updates')
    .eq('id', entry.master_contact_id)
    .single();
  if (!master) return { success: false, error: 'Contact not found.' };

  const token = generateOfferToken();
  const expiresAt = new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString();

  const { error: updateErr } = await service
    .from('waitlist_entries')
    .update({
      status: 'offered',
      tier_id: tierId,
      tickets_offered: ticketsOffered,
      offer_token: token,
      offer_expires_at: expiresAt,
      offered_at: new Date().toISOString(),
    })
    .eq('id', entry.id);
  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  const baseUrl = getBaseUrl();
  const offerUrl = `${baseUrl}/e/${event.slug}/offer/${token}`;
  const declineUrl = `${baseUrl}/e/${event.slug}/offer/${token}/decline`;
  const venueName = await getVenueName();
  const dateFormatted = formatDate(event.date_start, 'EEEE, MMMM d, yyyy · h:mm a');
  const expiresFormatted = formatDate(expiresAt, 'MMM d, yyyy · h:mm a');

  // Email — best effort
  if (master.email) {
    sendEmail({
      to: master.email as string,
      subject: `Tickets Available — ${event.title}`,
      react: WaitlistOfferEmail({
        firstName: (master.first_name as string) || 'there',
        eventTitle: event.title,
        dateFormatted,
        ticketsOffered,
        expiresFormatted,
        offerUrl,
        declineUrl,
        venueName,
        bannerText: event.location_name ?? venueName,
      }),
    }).catch((err) => console.error('sendWaitlistOffer email failed:', err));
  }

  // SMS — only if opted in
  if (master.phone && master.sms_opt_in_event_updates) {
    const shortDate = formatDate(event.date_start, 'MMM d');
    const expiresShort = formatDate(expiresAt, 'MMM d h:mm a');
    const body = `Tickets for ${event.title} on ${shortDate} are available for you! Purchase by ${expiresShort}: ${offerUrl}`;
    sendSms({ to: master.phone as string, body }).catch((err) =>
      console.error('sendWaitlistOffer sms failed:', err)
    );
  }

  return { success: true, data: { token } };
}

// ── Skip ────────────────────────────────────────────────────────────────

const skipSchema = z.object({
  entryId: z.string().uuid(),
});
export async function skipWaitlistEntry(
  input: z.infer<typeof skipSchema>
): Promise<ActionResponse<{ ok: true }>> {
  const parsed = skipSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' };
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }
  const service = createServiceClient();
  const { error } = await service
    .from('waitlist_entries')
    .update({ status: 'skipped' })
    .eq('id', parsed.data.entryId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: { ok: true } };
}

// ── Restore (un-skip) ───────────────────────────────────────────────────

export async function restoreWaitlistEntry(
  input: z.infer<typeof skipSchema>
): Promise<ActionResponse<{ ok: true }>> {
  const parsed = skipSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' };
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }
  const service = createServiceClient();
  const { error } = await service
    .from('waitlist_entries')
    .update({ status: 'waiting' })
    .eq('id', parsed.data.entryId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: { ok: true } };
}

// ── Custom Message ──────────────────────────────────────────────────────

const customMessageSchema = z.object({
  eventId: z.string().uuid(),
  entryIds: z.array(z.string().uuid()).min(1),
  channel: z.enum(['email', 'sms', 'both']),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
});
export type CustomMessageInput = z.infer<typeof customMessageSchema>;

export interface CustomMessageResult {
  emailSent: number;
  smsSent: number;
  skipped: number;
  failed: number;
}

function applyMergeTags(
  template: string,
  vars: { firstName: string; lastName: string; eventName: string; eventDate: string }
): string {
  return template
    .replace(/\{\{\s*first_name\s*\}\}/gi, vars.firstName)
    .replace(/\{\{\s*last_name\s*\}\}/gi, vars.lastName)
    .replace(/\{\{\s*event_name\s*\}\}/gi, vars.eventName)
    .replace(/\{\{\s*event_date\s*\}\}/gi, vars.eventDate);
}

export async function messageWaitlist(
  input: CustomMessageInput
): Promise<ActionResponse<CustomMessageResult>> {
  const parsed = customMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { eventId, entryIds, channel, subject, body } = parsed.data;
  if ((channel === 'email' || channel === 'both') && !subject?.trim()) {
    return { success: false, error: 'Subject is required for email sends.' };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const service = createServiceClient();
  const { data: event } = await service
    .from('events')
    .select('id, title, date_start, location_name')
    .eq('id', eventId)
    .single();
  if (!event) return { success: false, error: 'Event not found.' };

  const { data: entries } = await service
    .from('waitlist_entries')
    .select(
      'id, master_contacts!inner(first_name, last_name, email, phone, sms_opt_in_event_updates)'
    )
    .in('id', entryIds);
  if (!entries) {
    return { success: false, error: 'No entries found.' };
  }

  const venueName = await getVenueName();
  const dateFormatted = formatDate(event.date_start, 'EEEE, MMMM d, yyyy · h:mm a');

  let emailSent = 0;
  let smsSent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of entries) {
    const m = Array.isArray(row.master_contacts)
      ? row.master_contacts[0]
      : row.master_contacts;
    const firstName = (m?.first_name as string) || '';
    const lastName = (m?.last_name as string) || '';
    const emailAddr = (m?.email as string) || '';
    const phone = (m?.phone as string) || '';
    const smsOptIn = !!m?.sms_opt_in_event_updates;
    const personalizedBody = applyMergeTags(body, {
      firstName: firstName || 'there',
      lastName,
      eventName: event.title,
      eventDate: dateFormatted,
    });
    const personalizedSubject = subject
      ? applyMergeTags(subject, {
          firstName: firstName || 'there',
          lastName,
          eventName: event.title,
          eventDate: dateFormatted,
        })
      : undefined;

    let recipientReached = false;

    if ((channel === 'email' || channel === 'both') && emailAddr) {
      const res = await sendEmail({
        to: emailAddr,
        subject: personalizedSubject!,
        react: WaitlistCustomEmail({
          body: personalizedBody,
          venueName,
          bannerText: event.location_name ?? venueName,
        }),
      });
      if (res.success) {
        emailSent++;
        recipientReached = true;
      } else {
        failed++;
      }
      await service.from('invitation_logs').insert({
        event_id: eventId,
        contact_id: null,
        message_type: 'waitlist_custom',
        channel: 'email',
        status: res.success ? 'sent' : 'failed',
        provider_message_id: res.messageId ?? null,
      });
    }

    if ((channel === 'sms' || channel === 'both') && phone && smsOptIn) {
      const res = await sendSms({ to: phone, body: personalizedBody });
      if (res.success) {
        smsSent++;
        recipientReached = true;
      } else {
        failed++;
      }
      await service.from('invitation_logs').insert({
        event_id: eventId,
        contact_id: null,
        message_type: 'waitlist_custom',
        channel: 'sms',
        status: res.success ? 'sent' : 'failed',
        provider_message_id: res.messageId ?? null,
      });
    }

    if (!recipientReached) skipped++;
  }

  return {
    success: true,
    data: { emailSent, smsSent, skipped, failed },
  };
}
