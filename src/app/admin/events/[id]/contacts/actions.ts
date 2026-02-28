'use server';

import { z } from 'zod';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/resend';
import { sendSms } from '@/lib/twilio';
import { InvitationEmail } from '@/emails/invitation-email';
import type { ActionResponse } from '@/types/actions';
import { getVenueName } from '@/lib/settings';
import type { InvitationChannel } from '@/types/database';

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

const csvRowSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(200),
  last_name: z.string().min(1, 'Last name is required').max(200),
  email: z
    .string()
    .email('Invalid email')
    .optional()
    .nullable()
    .transform((v) => v || null),
  phone: z
    .string()
    .max(30)
    .optional()
    .nullable()
    .transform((v) => v || null),
  invitation_channel: channelEnum.optional().nullable(),
});

export type CsvRow = z.infer<typeof csvRowSchema>;

export interface ImportResult {
  importId: string;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
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

  // Fetch existing contacts for dedup
  const { data: existingContacts } = await supabase
    .from('contacts')
    .select('email, phone')
    .eq('event_id', eventId);

  const emailSet = new Set<string>();
  const phoneSet = new Set<string>();
  for (const c of existingContacts ?? []) {
    if (c.email) emailSet.add(c.email.toLowerCase());
    if (c.phone) phoneSet.add(c.phone);
  }

  const validRows: Array<{
    event_id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    invitation_channel: InvitationChannel;
    csv_source: string;
  }> = [];
  const skippedDetails: Array<{ row: number; reason: string }> = [];

  // Also track within-CSV dedup
  const csvEmailSet = new Set<string>();
  const csvPhoneSet = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const parsed = csvRowSchema.safeParse(rows[i]);

    if (!parsed.success) {
      const msg = parsed.error.issues.map((iss) => iss.message).join('; ');
      skippedDetails.push({ row: rowNum, reason: msg });
      continue;
    }

    const { first_name, last_name, email, phone, invitation_channel } = parsed.data;

    // Must have at least one of email or phone
    if (!email && !phone) {
      skippedDetails.push({ row: rowNum, reason: 'Missing both email and phone' });
      continue;
    }

    // Dedup against existing contacts
    if (email && emailSet.has(email.toLowerCase())) {
      skippedDetails.push({ row: rowNum, reason: `Duplicate email: ${email}` });
      continue;
    }
    if (!email && phone && phoneSet.has(phone)) {
      skippedDetails.push({ row: rowNum, reason: `Duplicate phone: ${phone}` });
      continue;
    }

    // Dedup within CSV
    if (email && csvEmailSet.has(email.toLowerCase())) {
      skippedDetails.push({ row: rowNum, reason: `Duplicate email within CSV: ${email}` });
      continue;
    }
    if (!email && phone && csvPhoneSet.has(phone)) {
      skippedDetails.push({ row: rowNum, reason: `Duplicate phone within CSV: ${phone}` });
      continue;
    }

    // Track for within-CSV dedup
    if (email) csvEmailSet.add(email.toLowerCase());
    if (phone) csvPhoneSet.add(phone);

    const channel = invitation_channel ?? defaultChannel(email, phone);

    validRows.push({
      event_id: eventId,
      first_name,
      last_name,
      email,
      phone,
      invitation_channel: channel,
      csv_source: filename,
    });
  }

  if (validRows.length > 0) {
    const { error: insertError } = await supabase
      .from('contacts')
      .insert(validRows);

    if (insertError) {
      return { success: false, error: insertError.message };
    }
  }

  // Insert csv_imports record
  const { data: importRecord, error: importError } = await supabase
    .from('csv_imports')
    .insert({
      event_id: eventId,
      filename,
      storage_path: 'inline',
      row_count: rows.length,
      imported_count: validRows.length,
      skipped_count: skippedDetails.length,
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
      importedCount: validRows.length,
      skippedCount: skippedDetails.length,
      skippedDetails,
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
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const eventUrl = `${origin}/e/${event.slug}`;
  const dateFormatted = format(new Date(event.date_start), 'EEEE, MMMM d, yyyy · h:mm a');
  const emailSubject = `You're invited to ${event.title}`;
  const smsBody = `You're invited to ${event.title} on ${format(new Date(event.date_start), 'MMM d, yyyy')}! View details & RSVP: ${eventUrl}`;

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
