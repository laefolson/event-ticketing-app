'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isValidPhone, normalizePhone, PHONE_VALIDATION_MESSAGE } from '@/lib/phone';
import { sendEmail } from '@/lib/resend';
import { WaitlistConfirmationEmail } from '@/emails/waitlist-confirmation-email';
import { getVenueName } from '@/lib/settings';
import { syncMasterContactFromCheckout } from '@/lib/checkout-master-sync';
import type { ActionResponse } from '@/types/actions';

const joinWaitlistSchema = z.object({
  event_id: z.string().uuid('Invalid event'),
  first_name: z.string().min(1, 'First name is required').max(120),
  last_name: z.string().min(1, 'Last name is required').max(120),
  email: z.string().email('A valid email address is required'),
  phone: z
    .string()
    .max(30, 'Phone number too long')
    .refine((v) => isValidPhone(v), PHONE_VALIDATION_MESSAGE)
    .transform((v) => v || null),
  tickets_requested: z.number().int().min(1).max(10),
  consent_event_updates: z.boolean(),
  consent_marketing: z.boolean(),
});

export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;

export type JoinWaitlistResult =
  | { kind: 'created' }
  | { kind: 'already_on_list' };

export async function joinWaitlist(
  slug: string,
  input: JoinWaitlistInput
): Promise<ActionResponse<JoinWaitlistResult>> {
  const parsed = joinWaitlistSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const {
    event_id,
    first_name,
    last_name,
    email,
    phone: rawPhone,
    tickets_requested,
    consent_event_updates,
    consent_marketing,
  } = parsed.data;
  const phone = normalizePhone(rawPhone);

  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, slug, title, is_published, link_active, waitlist_enabled, location_name')
    .eq('id', event_id)
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('link_active', true)
    .single();

  if (eventError || !event) {
    return { success: false, error: 'Event not found or no longer available.' };
  }
  if (!event.waitlist_enabled) {
    return { success: false, error: 'The waitlist is closed for this event.' };
  }

  const service = createServiceClient();

  // Reuse the master-contact sync helper but skip the per-event
  // contacts join row creation by NOT passing through to that flow —
  // we only want the master record. We mimic the sync inline so we
  // don't create a contacts join row for someone who hasn't been
  // invited; the waitlist_entries row is the canonical record.
  const emailLower = email.toLowerCase();
  const fullName = `${first_name} ${last_name}`.trim();
  await syncMasterContactFromCheckout(service, {
    eventId: event_id,
    email: emailLower,
    name: fullName,
    phone,
    smsOptInEvent: consent_event_updates,
    smsOptInMarketing: consent_marketing,
    source: 'manual',
    addedBy: 'manual',
  });

  const { data: master } = await service
    .from('master_contacts')
    .select('id')
    .eq('email', emailLower)
    .single();
  if (!master) {
    return { success: false, error: 'Failed to look up contact.' };
  }
  const masterId = master.id as string;

  // Dedupe: one waitlist entry per (event, master_contact).
  const { data: existing } = await service
    .from('waitlist_entries')
    .select('id, status')
    .eq('event_id', event_id)
    .eq('master_contact_id', masterId)
    .maybeSingle();
  if (existing) {
    return { success: true, data: { kind: 'already_on_list' } };
  }

  // Position = max+1 per event. Rare race conditions just create
  // duplicate-ish positions; that only affects sort order, not
  // correctness, and a unique constraint here would force retries
  // for no real gain.
  const { data: maxRow } = await service
    .from('waitlist_entries')
    .select('position')
    .eq('event_id', event_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? 0) + 1;

  const { error: insertError } = await service.from('waitlist_entries').insert({
    event_id,
    master_contact_id: masterId,
    position: nextPosition,
    tickets_requested,
    status: 'waiting',
  });
  if (insertError) {
    return { success: false, error: insertError.message };
  }

  // Record SMS consents for this event (matches checkout/RSVP behavior)
  if (phone && (consent_event_updates || consent_marketing)) {
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      headersList.get('x-real-ip') ??
      'unknown';
    const venueName = await getVenueName();
    const consentRecords: Array<{
      phone: string;
      consent_type: string;
      consent_text: string;
      ip_address: string;
      event_id: string;
    }> = [];
    if (consent_event_updates) {
      consentRecords.push({
        phone,
        consent_type: 'event_updates',
        consent_text: 'I agree to receive text messages about this event',
        ip_address: ipAddress,
        event_id,
      });
    }
    if (consent_marketing) {
      consentRecords.push({
        phone,
        consent_type: 'marketing',
        consent_text: `I agree to receive text messages about future events from ${venueName}`,
        ip_address: ipAddress,
        event_id,
      });
    }
    if (consentRecords.length > 0) {
      await service.from('sms_consents').insert(consentRecords);
    }
  }

  // Confirmation email — best effort
  const venueName = await getVenueName();
  sendEmail({
    to: email,
    subject: `Waitlist — ${event.title}`,
    react: WaitlistConfirmationEmail({
      firstName: first_name,
      eventTitle: event.title,
      venueName,
      bannerText: event.location_name ?? venueName,
    }),
  }).catch((err) => {
    console.error('joinWaitlist confirmation email failed:', err);
  });

  return { success: true, data: { kind: 'created' } };
}
