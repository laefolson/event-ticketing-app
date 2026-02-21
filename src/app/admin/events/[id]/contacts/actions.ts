'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/types/actions';
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
