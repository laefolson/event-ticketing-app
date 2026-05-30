// Shared logic for upserting CSV rows into master_contacts.
// Used by both the master-only import on /admin/contacts and the
// event-scoped import on /admin/events/[id]/contacts (which additionally
// creates a contacts join row per successful master_contacts upsert).

import type { createClient } from '@/lib/supabase/server';
import type { ContactSource } from '@/types/database';
import { normalizePhone } from '@/lib/phone';

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface MasterCsvRow {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  /**
   * Single-column SMS opt-in flag from the CSV. Per the spec, accepts
   * true/false/yes/no/1/0 (case-insensitive). When set, applies to both
   * the event-updates and marketing opt-ins.
   */
  sms_opt_in?: string | boolean | null;
}

export type RowOutcomeStatus = 'added' | 'updated' | 'skipped';

export interface RowOutcome {
  rowIndex: number;
  status: RowOutcomeStatus;
  masterContactId?: string;
  email?: string;
  reason?: string;
}

export interface ImportSummary {
  added: number;
  updated: number;
  skipped: number;
  total: number;
  /** Existing contacts whose SMS event-updates opt-in flipped from false to true. */
  optInEventPromoted: number;
  /** Existing contacts whose SMS marketing opt-in flipped from false to true. */
  optInMarketingPromoted: number;
  outcomes: RowOutcome[];
  skippedDetails: Array<{ row: number; reason: string }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseBoolish(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim().toLowerCase();
  if (s === '') return undefined;
  if (['true', 'yes', '1', 'y', 't'].includes(s)) return true;
  if (['false', 'no', '0', 'n', 'f'].includes(s)) return false;
  return undefined;
}

function norm(s?: string | null): string {
  return (s ?? '').trim();
}

export interface ProcessOptions {
  source?: ContactSource;
  /** When true, validate + categorize but do not write inserts or updates. */
  dryRun?: boolean;
}

export async function processMasterContactsCsv(
  supabase: SupabaseServerClient,
  rows: MasterCsvRow[],
  options: ProcessOptions | ContactSource = {}
): Promise<ImportSummary> {
  // Back-compat: existing callers pass a bare source string.
  const opts: ProcessOptions = typeof options === 'string' ? { source: options } : options;
  const source: ContactSource = opts.source ?? 'csv_import';
  const dryRun = opts.dryRun ?? false;
  const outcomes: RowOutcome[] = [];
  const skippedDetails: Array<{ row: number; reason: string }> = [];

  interface ValidRow {
    rowIndex: number;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    sms_event: boolean;
    sms_marketing: boolean;
  }

  const valid: ValidRow[] = [];
  const seenEmails = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;

    const first_name = norm(r.first_name);
    const last_name = norm(r.last_name);
    const email = norm(r.email).toLowerCase();
    const phone = normalizePhone(r.phone);

    if (!email) {
      outcomes.push({ rowIndex: i, status: 'skipped', reason: 'Missing email' });
      skippedDetails.push({ row: rowNum, reason: 'Missing email' });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      outcomes.push({ rowIndex: i, status: 'skipped', email, reason: 'Invalid email' });
      skippedDetails.push({ row: rowNum, reason: `Invalid email: ${email}` });
      continue;
    }
    if (!first_name) {
      outcomes.push({ rowIndex: i, status: 'skipped', email, reason: 'Missing first name' });
      skippedDetails.push({ row: rowNum, reason: 'Missing first name' });
      continue;
    }
    if (seenEmails.has(email)) {
      outcomes.push({ rowIndex: i, status: 'skipped', email, reason: 'Duplicate email within CSV' });
      skippedDetails.push({ row: rowNum, reason: `Duplicate email within CSV: ${email}` });
      continue;
    }
    seenEmails.add(email);

    const generic = parseBoolish(r.sms_opt_in);
    const sms_event = generic ?? false;
    const sms_marketing = generic ?? false;

    valid.push({
      rowIndex: i, email, first_name, last_name, phone, sms_event, sms_marketing,
    });
  }

  if (valid.length === 0) {
    return summarise(rows.length, outcomes, skippedDetails);
  }

  const { data: existingData, error: fetchError } = await supabase
    .from('master_contacts')
    .select('id, email, first_name, last_name, phone, sms_opt_in_event_updates, sms_opt_in_marketing')
    .in('email', valid.map((v) => v.email));

  if (fetchError) {
    throw new Error(`Failed to query master_contacts: ${fetchError.message}`);
  }
  const existingByEmail = new Map(
    (existingData ?? []).map((r) => [r.email as string, r])
  );

  interface Insertable {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    sms_opt_in_event_updates: boolean;
    sms_opt_in_marketing: boolean;
    source: ContactSource;
  }

  const toInsert: Insertable[] = [];
  const insertMeta: Array<{ rowIndex: number; email: string }> = [];

  interface UpdatePlan {
    id: string;
    rowIndex: number;
    email: string;
    fields: Partial<Insertable>;
  }
  const toUpdate: UpdatePlan[] = [];
  let optInEventPromoted = 0;
  let optInMarketingPromoted = 0;

  for (const v of valid) {
    const existing = existingByEmail.get(v.email);
    if (!existing) {
      toInsert.push({
        first_name: v.first_name,
        last_name: v.last_name,
        email: v.email,
        phone: v.phone,
        sms_opt_in_event_updates: v.sms_event,
        sms_opt_in_marketing: v.sms_marketing,
        source,
      });
      insertMeta.push({ rowIndex: v.rowIndex, email: v.email });
      continue;
    }

    const fields: Partial<Insertable> = {};
    if (!existing.first_name && v.first_name) fields.first_name = v.first_name;
    if (!existing.last_name && v.last_name) fields.last_name = v.last_name;
    // Phone: the source of truth wins. Update whenever the import provides
    // a phone and it differs from what's already stored.
    if (v.phone && v.phone !== existing.phone) fields.phone = v.phone;
    // Never downgrade an existing true opt-in to false; track promotions for the summary.
    if (v.sms_event && !existing.sms_opt_in_event_updates) {
      fields.sms_opt_in_event_updates = true;
      optInEventPromoted++;
    }
    if (v.sms_marketing && !existing.sms_opt_in_marketing) {
      fields.sms_opt_in_marketing = true;
      optInMarketingPromoted++;
    }

    if (Object.keys(fields).length > 0) {
      toUpdate.push({ id: existing.id as string, rowIndex: v.rowIndex, email: v.email, fields });
    } else {
      outcomes.push({
        rowIndex: v.rowIndex,
        status: 'updated',
        masterContactId: existing.id as string,
        email: v.email,
      });
    }
  }

  if (toInsert.length > 0) {
    if (dryRun) {
      for (const meta of insertMeta) {
        outcomes.push({
          rowIndex: meta.rowIndex,
          status: 'added',
          email: meta.email,
        });
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('master_contacts')
        .insert(toInsert)
        .select('id, email');
      if (insertError) {
        throw new Error(`Failed to insert master_contacts: ${insertError.message}`);
      }
      const idByEmail = new Map(
        (inserted ?? []).map((r) => [r.email as string, r.id as string])
      );
      for (const meta of insertMeta) {
        outcomes.push({
          rowIndex: meta.rowIndex,
          status: 'added',
          masterContactId: idByEmail.get(meta.email),
          email: meta.email,
        });
      }
    }
  }

  for (const u of toUpdate) {
    if (dryRun) {
      outcomes.push({
        rowIndex: u.rowIndex, status: 'updated', masterContactId: u.id, email: u.email,
      });
      continue;
    }
    const { error: updateError } = await supabase
      .from('master_contacts')
      .update(u.fields)
      .eq('id', u.id);
    if (updateError) {
      outcomes.push({
        rowIndex: u.rowIndex, status: 'skipped', email: u.email,
        reason: `Update failed: ${updateError.message}`,
      });
      skippedDetails.push({ row: u.rowIndex + 1, reason: `Update failed: ${updateError.message}` });
    } else {
      outcomes.push({
        rowIndex: u.rowIndex, status: 'updated', masterContactId: u.id, email: u.email,
      });
    }
  }

  outcomes.sort((a, b) => a.rowIndex - b.rowIndex);
  return summarise(rows.length, outcomes, skippedDetails, optInEventPromoted, optInMarketingPromoted);
}

function summarise(
  total: number,
  outcomes: RowOutcome[],
  skippedDetails: Array<{ row: number; reason: string }>,
  optInEventPromoted = 0,
  optInMarketingPromoted = 0
): ImportSummary {
  return {
    added: outcomes.filter((o) => o.status === 'added').length,
    updated: outcomes.filter((o) => o.status === 'updated').length,
    skipped: outcomes.filter((o) => o.status === 'skipped').length,
    total,
    optInEventPromoted,
    optInMarketingPromoted,
    outcomes,
    skippedDetails,
  };
}
