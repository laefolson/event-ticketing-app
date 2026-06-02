'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/types/actions';
import type { MasterContact } from '@/types/database';
import {
  processMasterContactsCsv,
  type MasterCsvRow,
} from '@/lib/master-contacts-import';
import { fetchPublicSheet } from '@/lib/google-sheets';
import { normalizePhone, isValidPhone, PHONE_VALIDATION_MESSAGE } from '@/lib/phone';

const contactInputSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(120),
  last_name: z.string().trim().max(120).default(''),
  email: z.string().trim().toLowerCase().email('Valid email is required'),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || isValidPhone(v), PHONE_VALIDATION_MESSAGE),
  sms_opt_in_event_updates: z.boolean().optional().default(false),
  sms_opt_in_marketing: z.boolean().optional().default(false),
  email_opt_out: z.boolean().optional().default(false),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export type ContactInput = z.input<typeof contactInputSchema>;

export async function createMasterContact(
  raw: ContactInput
): Promise<ActionResponse<MasterContact>> {
  const parsed = contactInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('master_contacts')
    .insert({
      first_name: v.first_name,
      last_name: v.last_name,
      email: v.email,
      phone: normalizePhone(v.phone),
      sms_opt_in_event_updates: v.sms_opt_in_event_updates,
      sms_opt_in_marketing: v.sms_opt_in_marketing,
      email_opt_out: v.email_opt_out,
      source: 'manual',
      notes: v.notes ? v.notes : null,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A contact with that email already exists' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/contacts');
  return { success: true, data: data as MasterContact };
}

export async function updateMasterContact(
  id: string,
  raw: ContactInput
): Promise<ActionResponse<MasterContact>> {
  const parsed = contactInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('master_contacts')
    .update({
      first_name: v.first_name,
      last_name: v.last_name,
      email: v.email,
      phone: normalizePhone(v.phone),
      sms_opt_in_event_updates: v.sms_opt_in_event_updates,
      sms_opt_in_marketing: v.sms_opt_in_marketing,
      email_opt_out: v.email_opt_out,
      notes: v.notes ? v.notes : null,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A contact with that email already exists' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/contacts');
  revalidatePath(`/admin/contacts/${id}`);
  return { success: true, data: data as MasterContact };
}

export async function deleteMasterContact(id: string): Promise<ActionResponse<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from('master_contacts').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/admin/contacts');
  return { success: true, data: { id } };
}

export interface BulkDeletionImpact {
  contactCount: number;
  upcomingTicketContacts: number;
  upcomingEventCount: number;
  pastTicketContacts: number;
}

/**
 * Aggregate impact summary for a bulk delete confirmation dialog. Counts
 * how many of the selected master contacts hold active tickets for
 * upcoming events, how many distinct upcoming events would be affected,
 * and how many have past-event attendance history that would lose its
 * contact-row link. Cheap: two scoped queries.
 */
export async function getBulkDeletionImpact(
  ids: string[]
): Promise<ActionResponse<BulkDeletionImpact>> {
  if (ids.length === 0) {
    return {
      success: true,
      data: {
        contactCount: 0,
        upcomingTicketContacts: 0,
        upcomingEventCount: 0,
        pastTicketContacts: 0,
      },
    };
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // Pull every ticket-bearing contact row for the selected masters along
  // with each event's start date. We narrow to confirmed/checked_in so
  // refunded/cancelled rows don't trigger a false warning.
  const { data, error } = await supabase
    .from('contacts')
    .select(`
      master_contact_id,
      event_id,
      events!inner(date_start),
      tickets!inner(status)
    `)
    .in('master_contact_id', ids)
    .in('tickets.status', ['confirmed', 'checked_in']);

  if (error) return { success: false, error: error.message };

  const upcomingContacts = new Set<string>();
  const upcomingEvents = new Set<string>();
  const pastContacts = new Set<string>();

  for (const row of data ?? []) {
    const masterId = row.master_contact_id as string | null;
    const eventId = row.event_id as string | null;
    const ev = Array.isArray(row.events) ? row.events[0] : row.events;
    const dateStart = ev?.date_start as string | undefined;
    if (!masterId || !eventId || !dateStart) continue;
    if (dateStart > nowIso) {
      upcomingContacts.add(masterId);
      upcomingEvents.add(eventId);
    } else {
      pastContacts.add(masterId);
    }
  }

  return {
    success: true,
    data: {
      contactCount: ids.length,
      upcomingTicketContacts: upcomingContacts.size,
      upcomingEventCount: upcomingEvents.size,
      pastTicketContacts: pastContacts.size,
    },
  };
}

export interface BulkDeleteResult {
  deleted: number;
  requested: number;
}

export async function deleteMasterContactsBulk(
  ids: string[]
): Promise<ActionResponse<BulkDeleteResult>> {
  if (ids.length === 0) return { success: false, error: 'No contacts selected.' };
  if (ids.length > 500) {
    return { success: false, error: 'Bulk delete is limited to 500 contacts at a time.' };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from('master_contacts')
    .delete({ count: 'exact' })
    .in('id', ids);

  if (error) return { success: false, error: error.message };
  revalidatePath('/admin/contacts');
  return { success: true, data: { deleted: count ?? 0, requested: ids.length } };
}

export interface MasterImportResult {
  totalRows: number;
  added: number;
  updated: number;
  skipped: number;
  optInEventPromoted: number;
  optInMarketingPromoted: number;
  skippedDetails: Array<{ row: number; reason: string }>;
}

export async function importMasterContacts(
  rows: MasterCsvRow[],
  contributorName: string | null = null
): Promise<ActionResponse<MasterImportResult>> {
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
  let summary;
  try {
    summary = await processMasterContactsCsv(supabase, rows, {
      source: 'csv_import',
      contributorName,
    });
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  revalidatePath('/admin/contacts');
  return {
    success: true,
    data: {
      totalRows: rows.length,
      added: summary.added,
      updated: summary.updated,
      skipped: summary.skipped,
      optInEventPromoted: summary.optInEventPromoted,
      optInMarketingPromoted: summary.optInMarketingPromoted,
      skippedDetails: summary.skippedDetails,
    },
  };
}

// ============================================================
// Phase 5: Google Sheets sync
// ============================================================

export interface SheetMapping {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  sms_opt_in?: string;
}

export interface SheetSyncConfig {
  url: string;
  mapping: SheetMapping;
}

const SHEET_SYNC_SETTING_KEY = 'google_sheets_sync';

const sheetMappingSchema = z.object({
  first_name: z.string().min(1, 'First name column is required'),
  last_name: z.string().min(1, 'Last name column is required'),
  email: z.string().min(1, 'Email column is required'),
  phone: z.string().optional(),
  sms_opt_in: z.string().optional(),
});

export interface SheetHeadersResult {
  headers: string[];
  rowCount: number;
  sheetName: string;
  /** Best-effort auto-detection of which header to use for each field. */
  suggestedMapping: SheetMapping;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

function suggestMapping(headers: string[]): SheetMapping {
  const normToOriginal = new Map<string, string>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (!normToOriginal.has(n)) normToOriginal.set(n, h);
  }
  const pick = (candidates: string[]): string | undefined => {
    for (const c of candidates) {
      const v = normToOriginal.get(c);
      if (v) return v;
    }
    return undefined;
  };
  return {
    first_name: pick(['first_name', 'firstname', 'first', 'fname']) ?? '',
    last_name: pick(['last_name', 'lastname', 'last', 'lname', 'surname']) ?? '',
    email: pick(['email', 'e_mail', 'email_address']) ?? '',
    phone: pick(['phone', 'mobile', 'cell', 'phone_number']),
    sms_opt_in: pick(['sms_opt_in', 'sms_consent']),
  };
}

export async function detectSheetHeaders(
  url: string
): Promise<ActionResponse<SheetHeadersResult>> {
  try {
    const { headers, dataRows, sheetName } = await fetchPublicSheet(url);
    if (headers.length === 0) {
      return { success: false, error: 'The sheet appears to be empty or has no header row.' };
    }
    return {
      success: true,
      data: {
        headers,
        rowCount: dataRows.length,
        sheetName,
        suggestedMapping: suggestMapping(headers),
      },
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

function rowsFromSheet(
  headers: string[],
  dataRows: string[][],
  mapping: SheetMapping
): MasterCsvRow[] {
  const colIndex = (header?: string) =>
    header ? headers.findIndex((h) => h === header) : -1;
  const idxFirst = colIndex(mapping.first_name);
  const idxLast = colIndex(mapping.last_name);
  const idxEmail = colIndex(mapping.email);
  const idxPhone = colIndex(mapping.phone);
  const idxSms = colIndex(mapping.sms_opt_in);
  return dataRows.map((row) => ({
    first_name: idxFirst >= 0 ? row[idxFirst] ?? '' : '',
    last_name: idxLast >= 0 ? row[idxLast] ?? '' : '',
    email: idxEmail >= 0 ? row[idxEmail] || null : null,
    phone: idxPhone >= 0 ? row[idxPhone] || null : null,
    sms_opt_in: idxSms >= 0 ? row[idxSms] || null : null,
  }));
}

export interface SheetSyncResult {
  totalRows: number;
  added: number;
  updated: number;
  skipped: number;
  optInEventPromoted: number;
  optInMarketingPromoted: number;
  skippedDetails: Array<{ row: number; reason: string }>;
}

async function runSheetSync(
  url: string,
  rawMapping: SheetMapping,
  dryRun: boolean,
  contributorName: string | null = null
): Promise<ActionResponse<SheetSyncResult>> {
  const parsed = sheetMappingSchema.safeParse(rawMapping);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid mapping' };
  }
  let fetched;
  try {
    fetched = await fetchPublicSheet(url);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  if (fetched.headers.length === 0) {
    return { success: false, error: 'The sheet has no header row to map.' };
  }
  const rows = rowsFromSheet(fetched.headers, fetched.dataRows, parsed.data);
  if (rows.length === 0) {
    return { success: false, error: 'The sheet has no data rows below the header.' };
  }

  const supabase = await createClient();
  let summary;
  try {
    summary = await processMasterContactsCsv(supabase, rows, {
      source: 'google_sheets',
      dryRun,
      contributorName,
    });
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  if (!dryRun) {
    await supabase
      .from('app_settings')
      .upsert({
        key: SHEET_SYNC_SETTING_KEY,
        value: { url, mapping: parsed.data } satisfies SheetSyncConfig,
        updated_at: new Date().toISOString(),
      });
    revalidatePath('/admin/contacts');
  }

  return {
    success: true,
    data: {
      totalRows: rows.length,
      added: summary.added,
      updated: summary.updated,
      skipped: summary.skipped,
      optInEventPromoted: summary.optInEventPromoted,
      optInMarketingPromoted: summary.optInMarketingPromoted,
      skippedDetails: summary.skippedDetails,
    },
  };
}

export async function previewGoogleSheetSync(
  url: string,
  mapping: SheetMapping,
  contributorName: string | null = null
): Promise<ActionResponse<SheetSyncResult>> {
  return runSheetSync(url, mapping, true, contributorName);
}

export async function runGoogleSheetSync(
  url: string,
  mapping: SheetMapping,
  contributorName: string | null = null
): Promise<ActionResponse<SheetSyncResult>> {
  return runSheetSync(url, mapping, false, contributorName);
}

/**
 * Distinct list of past contributor labels, sorted alphabetically. Used
 * to populate the datalist autocomplete on import dialogs.
 */
export async function listContributors(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('master_contacts')
    .select('contributor_name')
    .not('contributor_name', 'is', null)
    .order('contributor_name', { ascending: true });
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const v = (row.contributor_name as string | null)?.trim();
    if (v) seen.add(v);
  }
  return Array.from(seen);
}

export async function getSavedSheetSyncConfig(): Promise<ActionResponse<SheetSyncConfig | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SHEET_SYNC_SETTING_KEY)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data?.value as SheetSyncConfig | null) ?? null };
}
