'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { formatDate, getBaseUrl } from '@/lib/utils';
import { sendEmail } from '@/lib/resend';
import { sendSms } from '@/lib/twilio';
import { InvitationEmail } from '@/emails/invitation-email';
import { SaveTheDateEmail } from '@/emails/save-the-date-email';
import type { ActionResponse } from '@/types/actions';
import { getVenueName } from '@/lib/settings';
import type { InvitationChannel } from '@/types/database';
import { processMasterContactsCsv } from '@/lib/master-contacts-import';
import { normalizePhone } from '@/lib/phone';

const channelEnum = z.enum(['email', 'sms', 'both', 'none']);

const contactSchema = z
  .object({
    first_name: z.string().min(1, 'First name is required').max(200),
    last_name: z.string().min(1, 'Last name is required').max(200),
    email: z
      .string()
      .email('Invalid email address')
      .nullable()
      .transform((v) => v || null),
    phone: z
      .string()
      .max(30, 'Phone number too long')
      .nullable()
      .transform((v) => v || null),
    invitation_channel: channelEnum,
  })
  .refine((data) => data.email || data.phone, {
    message: 'At least one of email or phone is required',
  });

export type ContactInput = z.infer<typeof contactSchema>;

// Per-row validation now lives in src/lib/master-contacts-import; this type
// describes the shape the client constructs after Papa.parse.
export interface CsvRow {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  invitation_channel: InvitationChannel | null;
}

export interface ImportResult {
  importId: string;
  totalRows: number;
  /** Newly inserted into master_contacts. */
  addedToMaster: number;
  /** Matched an existing master_contacts row (may or may not have changed fields). */
  updatedInMaster: number;
  /** New contacts join rows created for this event. */
  addedToEvent: number;
  /** Master contact was already linked to this event — silently skipped. */
  alreadyInEvent: number;
  /** Rows that failed validation (missing email, invalid email, etc.). */
  skippedCount: number;
  /** Existing contacts whose SMS event-updates opt-in flipped from false to true during this import. */
  optInEventPromoted: number;
  /** Existing contacts whose SMS marketing opt-in flipped from false to true during this import. */
  optInMarketingPromoted: number;
  skippedDetails: Array<{ row: number; reason: string }>;
}

export async function createContact(
  eventId: string,
  input: ContactInput
): Promise<ActionResponse<{ contactId: string }>> {
  const parsed = contactSchema.safeParse(input);
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

  // Dedup check
  if (parsed.data.email) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('event_id', eventId)
      .ilike('email', parsed.data.email)
      .limit(1);

    if (existing && existing.length > 0) {
      return { success: false, error: 'A contact with this email already exists for this event.' };
    }
  } else if (parsed.data.phone) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('event_id', eventId)
      .eq('phone', parsed.data.phone)
      .limit(1);

    if (existing && existing.length > 0) {
      return { success: false, error: 'A contact with this phone number already exists for this event.' };
    }
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      event_id: eventId,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      invitation_channel: parsed.data.invitation_channel,
      csv_source: null,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: { contactId: data.id } };
}

export async function updateContact(
  contactId: string,
  input: ContactInput
): Promise<ActionResponse<{ contactId: string }>> {
  const parsed = contactSchema.safeParse(input);
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

  // Fetch existing contact for event_id
  const { data: existing, error: fetchError } = await supabase
    .from('contacts')
    .select('id, event_id')
    .eq('id', contactId)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Contact not found.' };
  }

  // Dedup check excluding self
  if (parsed.data.email) {
    const { data: dupe } = await supabase
      .from('contacts')
      .select('id')
      .eq('event_id', existing.event_id)
      .ilike('email', parsed.data.email)
      .neq('id', contactId)
      .limit(1);

    if (dupe && dupe.length > 0) {
      return { success: false, error: 'A contact with this email already exists for this event.' };
    }
  } else if (parsed.data.phone) {
    const { data: dupe } = await supabase
      .from('contacts')
      .select('id')
      .eq('event_id', existing.event_id)
      .eq('phone', parsed.data.phone)
      .neq('id', contactId)
      .limit(1);

    if (dupe && dupe.length > 0) {
      return { success: false, error: 'A contact with this phone number already exists for this event.' };
    }
  }

  const { error } = await supabase
    .from('contacts')
    .update({
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      invitation_channel: parsed.data.invitation_channel,
    })
    .eq('id', contactId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: { contactId } };
}

export async function deleteContact(
  contactId: string
): Promise<ActionResponse> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', contactId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

function defaultChannel(email: string | null, phone: string | null): InvitationChannel {
  if (email && phone) return 'both';
  if (email) return 'email';
  if (phone) return 'sms';
  return 'none';
}

export async function importContacts(
  eventId: string,
  rows: CsvRow[],
  filename: string
): Promise<ActionResponse<ImportResult>> {
  if (rows.length === 0) {
    return { success: false, error: 'CSV file is empty.' };
  }
  const payloadSize = new Blob([JSON.stringify(rows)]).size;
  if (payloadSize > 5 * 1024 * 1024) {
    return { success: false, error: 'CSV data exceeds 5 MB limit.' };
  }
  if (rows.length > 5000) {
    return { success: false, error: 'CSV file exceeds 5,000 row limit.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  // Step 1: upsert into master_contacts via the shared helper.
  let summary;
  try {
    summary = await processMasterContactsCsv(
      supabase,
      rows.map((r) => ({
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        phone: r.phone,
      }))
    );
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  // Map row index → master_contact_id for rows that successfully landed in master_contacts.
  const masterIdByRow = new Map<number, string>();
  for (const o of summary.outcomes) {
    if ((o.status === 'added' || o.status === 'updated') && o.masterContactId) {
      masterIdByRow.set(o.rowIndex, o.masterContactId);
    }
  }

  // Step 2: discover which master_contacts are already linked to this event.
  const allMasterIds = Array.from(new Set(masterIdByRow.values()));
  const { data: alreadyLinked } = allMasterIds.length > 0
    ? await supabase
        .from('contacts')
        .select('master_contact_id')
        .eq('event_id', eventId)
        .in('master_contact_id', allMasterIds)
    : { data: [] as { master_contact_id: string | null }[] };
  const alreadyLinkedIds = new Set(
    (alreadyLinked ?? [])
      .map((r) => r.master_contact_id as string | null)
      .filter((id): id is string => id !== null)
  );

  // Step 3: build contacts join rows for masters not yet linked to this event.
  // Legacy first_name/last_name/email/phone/csv_source columns are also populated
  // during the transition until the destructive migration drops them.
  interface JoinRow {
    event_id: string;
    master_contact_id: string;
    invitation_channel: InvitationChannel;
    added_by: 'csv_import';
    csv_source: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  }
  const joinRows: JoinRow[] = [];
  const seenMasterIds = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const masterId = masterIdByRow.get(i);
    if (!masterId) continue;
    if (alreadyLinkedIds.has(masterId)) continue;
    if (seenMasterIds.has(masterId)) continue;
    seenMasterIds.add(masterId);

    const r = rows[i];
    const email = (r.email ?? '').trim().toLowerCase();
    const phone = normalizePhone(r.phone);
    joinRows.push({
      event_id: eventId,
      master_contact_id: masterId,
      invitation_channel: r.invitation_channel ?? defaultChannel(email, phone),
      added_by: 'csv_import',
      csv_source: filename,
      first_name: (r.first_name ?? '').trim(),
      last_name: (r.last_name ?? '').trim(),
      email,
      phone,
    });
  }

  if (joinRows.length > 0) {
    const { error: joinErr } = await supabase.from('contacts').insert(joinRows);
    if (joinErr) {
      return {
        success: false,
        error: `Master contacts updated, but failed to link to event: ${joinErr.message}`,
      };
    }
  }

  // Step 4: csv_imports tracking record.
  const { data: importRecord, error: importError } = await supabase
    .from('csv_imports')
    .insert({
      event_id: eventId,
      filename,
      storage_path: 'inline',
      row_count: rows.length,
      imported_count: joinRows.length,
      skipped_count: summary.skipped,
      imported_by: user.id,
    })
    .select('id')
    .single();
  if (importError) {
    return { success: false, error: importError.message };
  }

  return {
    success: true,
    data: {
      importId: importRecord.id,
      totalRows: rows.length,
      addedToMaster: summary.added,
      updatedInMaster: summary.updated,
      addedToEvent: joinRows.length,
      alreadyInEvent: alreadyLinkedIds.size,
      skippedCount: summary.skipped,
      optInEventPromoted: summary.optInEventPromoted,
      optInMarketingPromoted: summary.optInMarketingPromoted,
      skippedDetails: summary.skippedDetails,
    },
  };
}

export async function updateContactChannel(
  contactId: string,
  channel: InvitationChannel
): Promise<ActionResponse> {
  const validChannels: InvitationChannel[] = ['email', 'sms', 'both', 'none'];
  if (!validChannels.includes(channel)) {
    return { success: false, error: 'Invalid channel.' };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const { error } = await supabase
    .from('contacts')
    .update({ invitation_channel: channel })
    .eq('id', contactId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function bulkUpdateContactChannel(
  eventId: string,
  scope: 'all' | 'selected',
  contactIds: string[],
  channel: InvitationChannel
): Promise<ActionResponse<{ updated: number }>> {
  const validChannels: InvitationChannel[] = ['email', 'sms', 'both', 'none'];
  if (!validChannels.includes(channel)) {
    return { success: false, error: 'Invalid channel.' };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  let query = supabase
    .from('contacts')
    .update({ invitation_channel: channel })
    .eq('event_id', eventId);

  if (scope === 'selected') {
    if (contactIds.length === 0) {
      return { success: false, error: 'No contacts selected.' };
    }
    query = query.in('id', contactIds);
  }

  const { data, error } = await query.select('id');

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: { updated: data?.length ?? 0 } };
}

// ── Invitation Sending ──────────────────────────────────────────────────

export type InvitationScope = 'all' | 'uninvited' | 'selected';

const invitationSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  scope: z.enum(['all', 'uninvited', 'selected']),
  contactIds: z.array(z.string().uuid()).optional(),
});

export type SendInvitationsInput = z.infer<typeof invitationSchema>;

export interface InvitationResult {
  sent: number;
  failed: number;
  failedDetails: string[];
}

export async function sendInvitations(
  input: SendInvitationsInput
): Promise<ActionResponse<InvitationResult>> {
  const parsed = invitationSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { success: false, error: firstError.message };
  }

  const { eventId, scope, contactIds } = parsed.data;

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  // Fetch event details for the template
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, slug, date_start, location_name')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return { success: false, error: 'Event not found.' };
  }

  // Build contacts query based on scope
  let query = supabase
    .from('contacts')
    .select('id, first_name, last_name, email, phone, invitation_channel')
    .eq('event_id', eventId)
    .neq('invitation_channel', 'none');

  if (scope === 'uninvited') {
    query = query.is('invited_at', null);
  } else if (scope === 'selected') {
    if (!contactIds || contactIds.length === 0) {
      return { success: false, error: 'No contacts selected.' };
    }
    query = query.in('id', contactIds);
  }

  const { data: contacts, error: contactsError } = await query;

  if (contactsError) {
    return { success: false, error: contactsError.message };
  }

  if (!contacts || contacts.length === 0) {
    return { success: false, error: 'No contacts to send invitations to.' };
  }

  const venueName = await getVenueName();
  const origin = getBaseUrl();
  const eventUrl = `${origin}/e/${event.slug}`;
  const dateFormatted = formatDate(event.date_start, 'EEEE, MMMM d, yyyy · h:mm a');
  const emailSubject = `You're invited to ${event.title}`;
  const smsBody = `You're invited to ${event.title} on ${formatDate(event.date_start, 'MMM d, yyyy')}! View details & RSVP: ${eventUrl}`;

  let sent = 0;
  let failed = 0;
  const failedDetails: string[] = [];

  for (const contact of contacts) {
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Guest';
    const firstName = contact.first_name || 'Guest';
    const channel = contact.invitation_channel as InvitationChannel;

    // Send email if channel is email or both
    if ((channel === 'email' || channel === 'both') && contact.email) {
      const emailResult = await sendEmail({
        to: contact.email,
        subject: emailSubject,
        react: InvitationEmail({
          firstName,
          eventTitle: event.title,
          dateFormatted,
          locationName: event.location_name,
          eventUrl,
          venueName,
        }),
      });

      await supabase.from('invitation_logs').insert({
        event_id: eventId,
        contact_id: contact.id,
        message_type: 'invitation',
        channel: 'email',
        status: emailResult.success ? 'sent' : 'failed',
        provider_message_id: emailResult.messageId ?? null,
      });

      if (emailResult.success) {
        sent++;
      } else {
        failed++;
        failedDetails.push(`${name} (email): ${emailResult.error}`);
      }
    }

    // Send SMS if channel is sms or both
    if ((channel === 'sms' || channel === 'both') && contact.phone) {
      const smsResult = await sendSms({
        to: contact.phone,
        body: smsBody,
      });

      await supabase.from('invitation_logs').insert({
        event_id: eventId,
        contact_id: contact.id,
        message_type: 'invitation',
        channel: 'sms',
        status: smsResult.success ? 'sent' : 'failed',
        provider_message_id: smsResult.messageId ?? null,
      });

      if (smsResult.success) {
        sent++;
      } else {
        failed++;
        failedDetails.push(`${name} (sms): ${smsResult.error}`);
      }
    }

    // Mark contact as invited
    await supabase
      .from('contacts')
      .update({ invited_at: new Date().toISOString() })
      .eq('id', contact.id);
  }

  return { success: true, data: { sent, failed, failedDetails } };
}

// ── Save the Date Sending ─────────────────────────────────────────────

export type SaveTheDateScope = 'all' | 'uninvited' | 'selected';

const saveTheDateSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  scope: z.enum(['all', 'uninvited', 'selected']),
  contactIds: z.array(z.string().uuid()).optional(),
});

export type SendSaveTheDatesInput = z.infer<typeof saveTheDateSchema>;

export interface SaveTheDateResult {
  sent: number;
  failed: number;
  failedDetails: string[];
}

export async function sendSaveTheDates(
  input: SendSaveTheDatesInput
): Promise<ActionResponse<SaveTheDateResult>> {
  const parsed = saveTheDateSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { success: false, error: firstError.message };
  }

  const { eventId, scope, contactIds } = parsed.data;

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  // Fetch event details
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, date_start, save_the_date_image_url, save_the_date_text')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return { success: false, error: 'Event not found.' };
  }

  // Build contacts query based on scope
  let query = supabase
    .from('contacts')
    .select('id, first_name, last_name, email, phone, invitation_channel')
    .eq('event_id', eventId)
    .neq('invitation_channel', 'none');

  if (scope === 'uninvited') {
    query = query.is('invited_at', null);
  } else if (scope === 'selected') {
    if (!contactIds || contactIds.length === 0) {
      return { success: false, error: 'No contacts selected.' };
    }
    query = query.in('id', contactIds);
  }

  const { data: contacts, error: contactsError } = await query;

  if (contactsError) {
    return { success: false, error: contactsError.message };
  }

  if (!contacts || contacts.length === 0) {
    return { success: false, error: 'No contacts to send save-the-dates to.' };
  }

  const venueName = await getVenueName();
  const emailSubject = `Save the Date: ${event.title}`;
  const dateFormatted = formatDate(event.date_start, 'MMM d, yyyy');
  const smsBody = `Save the date! ${event.title} on ${dateFormatted}. More details coming soon.`;

  let sent = 0;
  let failed = 0;
  const failedDetails: string[] = [];

  for (const contact of contacts) {
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Guest';
    const firstName = contact.first_name || 'Guest';
    const channel = contact.invitation_channel as InvitationChannel;

    // Send email if channel is email or both
    if ((channel === 'email' || channel === 'both') && contact.email) {
      const emailResult = await sendEmail({
        to: contact.email,
        subject: emailSubject,
        react: SaveTheDateEmail({
          firstName,
          eventTitle: event.title,
          imageUrl: event.save_the_date_image_url,
          additionalText: event.save_the_date_text,
          venueName,
        }),
      });

      await supabase.from('invitation_logs').insert({
        event_id: eventId,
        contact_id: contact.id,
        message_type: 'save_the_date',
        channel: 'email',
        status: emailResult.success ? 'sent' : 'failed',
        provider_message_id: emailResult.messageId ?? null,
      });

      if (emailResult.success) {
        sent++;
      } else {
        failed++;
        failedDetails.push(`${name} (email): ${emailResult.error}`);
      }
    }

    // Send SMS if channel is sms or both
    if ((channel === 'sms' || channel === 'both') && contact.phone) {
      const smsResult = await sendSms({
        to: contact.phone,
        body: smsBody,
      });

      await supabase.from('invitation_logs').insert({
        event_id: eventId,
        contact_id: contact.id,
        message_type: 'save_the_date',
        channel: 'sms',
        status: smsResult.success ? 'sent' : 'failed',
        provider_message_id: smsResult.messageId ?? null,
      });

      if (smsResult.success) {
        sent++;
      } else {
        failed++;
        failedDetails.push(`${name} (sms): ${smsResult.error}`);
      }
    }

    // NOTE: Do NOT update invited_at — that's only for actual invitations
  }

  return { success: true, data: { sent, failed, failedDetails } };
}

// ============================================================
// Phase 4: Add from Master List
// ============================================================

const MASTER_PICK_LIMIT = 100;

export interface PickableMasterContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  sms_opt_in_event_updates: boolean;
  sms_opt_in_marketing: boolean;
  isAlreadyInEvent: boolean;
  eventCount: number;
}

async function attachAlreadyInEventFlags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  masters: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    sms_opt_in_event_updates: boolean;
    sms_opt_in_marketing: boolean;
  }>
): Promise<PickableMasterContact[]> {
  if (masters.length === 0) return [];
  const ids = masters.map((m) => m.id);

  const [{ data: linkedInThisEvent }, { data: allLinks }] = await Promise.all([
    supabase
      .from('contacts')
      .select('master_contact_id')
      .eq('event_id', eventId)
      .in('master_contact_id', ids),
    supabase
      .from('contacts')
      .select('master_contact_id')
      .in('master_contact_id', ids),
  ]);

  const linkedSet = new Set(
    (linkedInThisEvent ?? [])
      .map((r) => r.master_contact_id as string | null)
      .filter((x): x is string => x !== null)
  );
  const eventCountById = new Map<string, number>();
  for (const r of allLinks ?? []) {
    const mid = r.master_contact_id as string | null;
    if (mid) eventCountById.set(mid, (eventCountById.get(mid) ?? 0) + 1);
  }

  return masters.map((m) => ({
    ...m,
    isAlreadyInEvent: linkedSet.has(m.id),
    eventCount: eventCountById.get(m.id) ?? 0,
  }));
}

export async function searchMasterContactsForEvent(
  eventId: string,
  query: string
): Promise<ActionResponse<PickableMasterContact[]>> {
  const supabase = await createClient();
  let q = supabase
    .from('master_contacts')
    .select(
      'id, first_name, last_name, email, phone, sms_opt_in_event_updates, sms_opt_in_marketing'
    )
    .order('created_at', { ascending: false })
    .limit(MASTER_PICK_LIMIT);

  const term = query.trim().replace(/[%,]/g, ' ');
  if (term) {
    q = q.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`
    );
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const enriched = await attachAlreadyInEventFlags(
    supabase,
    eventId,
    (data ?? []) as PickableMasterContact[]
  );
  return { success: true, data: enriched };
}

export async function getMasterContactsForPriorEvent(
  eventId: string,
  priorEventId: string,
  attendeesOnly: boolean
): Promise<ActionResponse<PickableMasterContact[]>> {
  const supabase = await createClient();

  const { data: contactRows, error: contactErr } = await supabase
    .from('contacts')
    .select('master_contact_id')
    .eq('event_id', priorEventId)
    .not('master_contact_id', 'is', null);
  if (contactErr) return { success: false, error: contactErr.message };

  let masterIds = Array.from(
    new Set(
      (contactRows ?? [])
        .map((r) => r.master_contact_id as string | null)
        .filter((x): x is string => x !== null)
    )
  );

  if (attendeesOnly && masterIds.length > 0) {
    const { data: ticketsData } = await supabase
      .from('tickets')
      .select('attendee_email, contact_id')
      .eq('event_id', priorEventId)
      .in('status', ['confirmed', 'checked_in']);
    const attendeeEmails = new Set(
      (ticketsData ?? [])
        .map((t) => (t.attendee_email as string | null)?.toLowerCase())
        .filter(Boolean) as string[]
    );
    // Resolve ticket attendee emails back to master ids
    if (attendeeEmails.size > 0) {
      const { data: masterAttendees } = await supabase
        .from('master_contacts')
        .select('id')
        .in('email', Array.from(attendeeEmails));
      const allowed = new Set(
        (masterAttendees ?? []).map((m) => m.id as string)
      );
      masterIds = masterIds.filter((id) => allowed.has(id));
    } else {
      masterIds = [];
    }
  }

  if (masterIds.length === 0) {
    return { success: true, data: [] };
  }

  const { data, error } = await supabase
    .from('master_contacts')
    .select(
      'id, first_name, last_name, email, phone, sms_opt_in_event_updates, sms_opt_in_marketing'
    )
    .in('id', masterIds)
    .order('created_at', { ascending: false })
    .limit(MASTER_PICK_LIMIT);
  if (error) return { success: false, error: error.message };
  const enriched = await attachAlreadyInEventFlags(
    supabase,
    eventId,
    (data ?? []) as PickableMasterContact[]
  );
  return { success: true, data: enriched };
}

export async function getMasterContactsByOptIn(
  eventId: string,
  optInEvent: boolean,
  optInMarketing: boolean
): Promise<ActionResponse<PickableMasterContact[]>> {
  const supabase = await createClient();
  let q = supabase
    .from('master_contacts')
    .select(
      'id, first_name, last_name, email, phone, sms_opt_in_event_updates, sms_opt_in_marketing'
    )
    .order('created_at', { ascending: false })
    .limit(MASTER_PICK_LIMIT);

  if (optInEvent) q = q.eq('sms_opt_in_event_updates', true);
  if (optInMarketing) q = q.eq('sms_opt_in_marketing', true);
  if (!optInEvent && !optInMarketing) {
    return { success: true, data: [] };
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  // Exclude contacts already in this event from the result entirely (per spec).
  const enriched = await attachAlreadyInEventFlags(
    supabase,
    eventId,
    (data ?? []) as PickableMasterContact[]
  );
  return { success: true, data: enriched.filter((c) => !c.isAlreadyInEvent) };
}

const addToEventChannel = z.enum(['email', 'sms', 'both']);
const addToEventAddedBy = z.enum(['manual', 'event_copy']);

export async function addMasterContactsToEvent(
  eventId: string,
  items: Array<{ masterContactId: string; addedBy: 'manual' | 'event_copy' }>,
  invitationChannel: 'email' | 'sms' | 'both'
): Promise<ActionResponse<{ added: number; alreadyInEvent: number }>> {
  if (items.length === 0) {
    return { success: false, error: 'No contacts selected.' };
  }
  const channelParse = addToEventChannel.safeParse(invitationChannel);
  if (!channelParse.success) {
    return { success: false, error: 'Invalid invitation channel.' };
  }
  for (const it of items) {
    if (!addToEventAddedBy.safeParse(it.addedBy).success) {
      return { success: false, error: 'Invalid added_by value.' };
    }
  }

  const supabase = await createClient();

  // Find which masters are already linked to this event.
  const ids = Array.from(new Set(items.map((i) => i.masterContactId)));
  const { data: linked } = await supabase
    .from('contacts')
    .select('master_contact_id')
    .eq('event_id', eventId)
    .in('master_contact_id', ids);
  const linkedSet = new Set(
    (linked ?? [])
      .map((r) => r.master_contact_id as string | null)
      .filter((x): x is string => x !== null)
  );

  const toLinkItems = items.filter((i) => !linkedSet.has(i.masterContactId));
  const toLinkIds = toLinkItems.map((i) => i.masterContactId);
  if (toLinkIds.length === 0) {
    return { success: true, data: { added: 0, alreadyInEvent: items.length } };
  }

  // Look up master contact records to populate legacy contacts columns.
  const { data: masters, error: masterErr } = await supabase
    .from('master_contacts')
    .select('id, first_name, last_name, email, phone')
    .in('id', toLinkIds);
  if (masterErr) return { success: false, error: masterErr.message };
  const masterById = new Map(
    (masters ?? []).map((m) => [m.id as string, m])
  );

  const joinRows = toLinkItems.flatMap((item) => {
    const m = masterById.get(item.masterContactId);
    if (!m) return [];
    return [
      {
        event_id: eventId,
        master_contact_id: item.masterContactId,
        invitation_channel: invitationChannel as InvitationChannel,
        added_by: item.addedBy,
        first_name: (m.first_name as string) || '',
        last_name: (m.last_name as string) || '',
        email: (m.email as string) || '',
        phone: (m.phone as string | null) ?? null,
      },
    ];
  });

  if (joinRows.length === 0) {
    return { success: true, data: { added: 0, alreadyInEvent: linkedSet.size } };
  }

  const { error: insertErr } = await supabase.from('contacts').insert(joinRows);
  if (insertErr) return { success: false, error: insertErr.message };

  return {
    success: true,
    data: { added: joinRows.length, alreadyInEvent: linkedSet.size },
  };
}
