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
import { normalizePhone, isValidPhone, PHONE_VALIDATION_MESSAGE } from '@/lib/phone';

const channelEnum = z.enum(['email', 'sms', 'both', 'none']);

const contactSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(200),
  last_name: z.string().min(1, 'Last name is required').max(200),
  email: z.string().email('Valid email is required').trim().toLowerCase(),
  phone: z
    .string()
    .max(30, 'Phone number too long')
    .nullable()
    .refine((v) => isValidPhone(v), PHONE_VALIDATION_MESSAGE)
    .transform((v) => v || null),
  invitation_channel: channelEnum,
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

  const { first_name, last_name, email, phone, invitation_channel } = parsed.data;
  const normalizedPhone = normalizePhone(phone);

  // Upsert into master_contacts by email.
  const { data: existingMaster } = await supabase
    .from('master_contacts')
    .select('id, first_name, last_name, phone')
    .eq('email', email)
    .maybeSingle();

  let masterContactId: string;
  if (existingMaster) {
    const fields: Record<string, unknown> = {};
    if (!existingMaster.first_name && first_name) fields.first_name = first_name;
    if (!existingMaster.last_name && last_name) fields.last_name = last_name;
    if (normalizedPhone && normalizedPhone !== existingMaster.phone) fields.phone = normalizedPhone;
    if (Object.keys(fields).length > 0) {
      const { error: updateErr } = await supabase
        .from('master_contacts')
        .update(fields)
        .eq('id', existingMaster.id);
      if (updateErr) return { success: false, error: updateErr.message };
    }
    masterContactId = existingMaster.id as string;
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from('master_contacts')
      .insert({
        first_name,
        last_name,
        email,
        phone: normalizedPhone,
        source: 'manual',
      })
      .select('id')
      .single();
    if (insertErr) return { success: false, error: insertErr.message };
    masterContactId = inserted.id as string;
  }

  // Check whether this master is already linked to this event.
  const { data: existingJoin } = await supabase
    .from('contacts')
    .select('id')
    .eq('event_id', eventId)
    .eq('master_contact_id', masterContactId)
    .maybeSingle();
  if (existingJoin) {
    return { success: false, error: 'This contact is already in this event.' };
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      event_id: eventId,
      master_contact_id: masterContactId,
      invitation_channel,
      added_by: 'manual',
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

  // Fetch the contacts row for its master_contact_id.
  const { data: existing, error: fetchError } = await supabase
    .from('contacts')
    .select('id, master_contact_id')
    .eq('id', contactId)
    .single();
  if (fetchError || !existing || !existing.master_contact_id) {
    return { success: false, error: 'Contact not found.' };
  }

  const { first_name, last_name, email, phone, invitation_channel } = parsed.data;
  const normalizedPhone = normalizePhone(phone);

  // Update master_contacts — note this affects every event the contact is in.
  const { error: masterErr } = await supabase
    .from('master_contacts')
    .update({
      first_name,
      last_name,
      email,
      phone: normalizedPhone,
    })
    .eq('id', existing.master_contact_id);
  if (masterErr) {
    if (masterErr.code === '23505') {
      return { success: false, error: 'Another contact already uses that email.' };
    }
    return { success: false, error: masterErr.message };
  }

  // Update the per-event invitation channel.
  const { error: channelErr } = await supabase
    .from('contacts')
    .update({ invitation_channel })
    .eq('id', contactId);
  if (channelErr) return { success: false, error: channelErr.message };

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
  interface JoinRow {
    event_id: string;
    master_contact_id: string;
    invitation_channel: InvitationChannel;
    added_by: 'csv_import';
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

  // Fetch event details for the template. Includes the notification override
  // columns so admins can customize intro copy, the marketing image, after-image
  // text, and the SMS body per-event.
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, slug, date_start, location_name, cover_image_url, invitation_intro_text, invitation_image_url, invitation_after_image_text, invitation_sms_body')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return { success: false, error: 'Event not found.' };
  }

  // Pull tier prices to determine button label: "RSVP" for free events,
  // otherwise "View Event & Purchase Tickets".
  const { data: tierRows } = await supabase
    .from('ticket_tiers')
    .select('price_cents')
    .eq('event_id', eventId);
  const isFreeEvent =
    !!tierRows && tierRows.length > 0 &&
    tierRows.every((t) => (t.price_cents ?? 0) === 0);

  // Build contacts query based on scope. Reads name/email/phone via the
  // master_contacts join so we stop depending on legacy contacts columns.
  let query = supabase
    .from('contacts')
    .select(
      `id, invitation_channel,
       master_contacts!inner(first_name, last_name, email, phone)`
    )
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
  const emailSubject = `You're invited to ${event.title}`;
  const defaultSmsBody = `You're invited to ${event.title} on ${formatDate(event.date_start, 'MMM d, yyyy')}! View details: ${eventUrl}`;
  const smsBody = event.invitation_sms_body?.trim()
    ? `${event.invitation_sms_body.trim()} ${eventUrl}`
    : defaultSmsBody;
  const bannerText = event.location_name ?? venueName;
  const invitationImage = event.invitation_image_url ?? event.cover_image_url;

  let sent = 0;
  let failed = 0;
  const failedDetails: string[] = [];

  for (const contact of contacts) {
    // Supabase typegen returns the embed as an object for a many-to-one FK,
    // but the inferred type is sometimes a single-element array. Normalize.
    const master = Array.isArray(contact.master_contacts)
      ? contact.master_contacts[0]
      : contact.master_contacts;
    const first_name = master?.first_name ?? '';
    const last_name = master?.last_name ?? '';
    const email = master?.email ?? null;
    const phone = master?.phone ?? null;

    const name = [first_name, last_name].filter(Boolean).join(' ') || 'Guest';
    const firstName = first_name || 'Guest';
    const channel = contact.invitation_channel as InvitationChannel;

    // Send email if channel is email or both
    if ((channel === 'email' || channel === 'both') && email) {
      const emailResult = await sendEmail({
        to: email,
        subject: emailSubject,
        react: InvitationEmail({
          firstName,
          eventTitle: event.title,
          eventUrl,
          venueName,
          bannerText,
          introText: event.invitation_intro_text,
          imageUrl: invitationImage,
          afterImageText: event.invitation_after_image_text,
          isFreeEvent,
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
    if ((channel === 'sms' || channel === 'both') && phone) {
      const smsResult = await sendSms({
        to: phone,
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

  // Fetch event details (includes per-event save-the-date overrides).
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, date_start, location_name, save_the_date_image_url, save_the_date_text, save_the_date_intro_text, save_the_date_sms_body')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return { success: false, error: 'Event not found.' };
  }

  // Build contacts query based on scope; read name/email/phone via the master join.
  let query = supabase
    .from('contacts')
    .select(
      `id, invitation_channel,
       master_contacts!inner(first_name, last_name, email, phone)`
    )
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
  const smsBody = event.save_the_date_sms_body?.trim()
    ?? `Save the date! ${event.title} on ${dateFormatted}. More details coming soon.`;
  const bannerText = event.location_name ?? venueName;

  let sent = 0;
  let failed = 0;
  const failedDetails: string[] = [];

  for (const contact of contacts) {
    const master = Array.isArray(contact.master_contacts)
      ? contact.master_contacts[0]
      : contact.master_contacts;
    const first_name = master?.first_name ?? '';
    const last_name = master?.last_name ?? '';
    const email = master?.email ?? null;
    const phone = master?.phone ?? null;

    const name = [first_name, last_name].filter(Boolean).join(' ') || 'Guest';
    const firstName = first_name || 'Guest';
    const channel = contact.invitation_channel as InvitationChannel;

    // Send email if channel is email or both
    if ((channel === 'email' || channel === 'both') && email) {
      const emailResult = await sendEmail({
        to: email,
        subject: emailSubject,
        react: SaveTheDateEmail({
          firstName,
          eventTitle: event.title,
          imageUrl: event.save_the_date_image_url,
          additionalText: event.save_the_date_text,
          introText: event.save_the_date_intro_text,
          venueName,
          bannerText,
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
    if ((channel === 'sms' || channel === 'both') && phone) {
      const smsResult = await sendSms({
        to: phone,
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

  const joinRows = toLinkItems.map((item) => ({
    event_id: eventId,
    master_contact_id: item.masterContactId,
    invitation_channel: invitationChannel as InvitationChannel,
    added_by: item.addedBy,
  }));

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
