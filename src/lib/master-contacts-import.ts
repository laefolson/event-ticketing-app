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
  /** Null for phone-only rows, which have no email to report. */
  email?: string | null;
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

/**
 * Identity key for a contact that has no email. Phone alone is NOT enough:
 * production has 13 numbers shared by two or more contacts (couples and
 * households on one mobile), so matching on phone alone would merge distinct
 * people. Requiring the name too keeps those separate while still catching a
 * re-import of the same list.
 */
function nameKey(first: string, last: string, phone: string): string {
  return `${first.trim().toLowerCase()}|${last.trim().toLowerCase()}|${phone}`;
}

export interface ProcessOptions {
  source?: ContactSource;
  /** When true, validate + categorize but do not write inserts or updates. */
  dryRun?: boolean;
  /**
   * Free-text label for who supplied this batch (e.g. "alice smith").
   * Normalized to lowercase + trimmed by the caller. Applied only to
   * newly inserted rows — the original contributor keeps the credit if
   * the same email shows up in a later batch from someone else.
   */
  contributorName?: string | null;
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
  const contributorName = opts.contributorName?.trim().toLowerCase() || null;
  const outcomes: RowOutcome[] = [];
  const skippedDetails: Array<{ row: number; reason: string }> = [];

  interface ValidRow {
    rowIndex: number;
    /** Null for phone-only rows. */
    email: string | null;
    first_name: string;
    last_name: string;
    phone: string | null;
    sms_event: boolean;
    sms_marketing: boolean;
  }

  const valid: ValidRow[] = [];
  const seenEmails = new Set<string>();
  // Phone-only rows have no email to dedup on, so they are keyed by
  // name+phone instead. See nameKey() for why the name is part of the key.
  const seenNamePhone = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;

    const first_name = norm(r.first_name);
    const last_name = norm(r.last_name);
    const rawEmail = norm(r.email).toLowerCase();
    const phone = normalizePhone(r.phone);

    // A row must be reachable somehow — matches the master_contacts_reachable
    // CHECK constraint, so we reject here rather than letting the insert fail.
    if (!rawEmail && !phone) {
      outcomes.push({ rowIndex: i, status: 'skipped', reason: 'No email or phone' });
      skippedDetails.push({ row: rowNum, reason: 'No email or phone' });
      continue;
    }
    if (rawEmail && !EMAIL_RE.test(rawEmail)) {
      outcomes.push({ rowIndex: i, status: 'skipped', email: rawEmail, reason: 'Invalid email' });
      skippedDetails.push({ row: rowNum, reason: `Invalid email: ${rawEmail}` });
      continue;
    }
    const email = rawEmail || null;

    if (!first_name) {
      outcomes.push({ rowIndex: i, status: 'skipped', ...(email ? { email } : {}), reason: 'Missing first name' });
      skippedDetails.push({ row: rowNum, reason: 'Missing first name' });
      continue;
    }

    if (email) {
      if (seenEmails.has(email)) {
        outcomes.push({ rowIndex: i, status: 'skipped', email, reason: 'Duplicate email within CSV' });
        skippedDetails.push({ row: rowNum, reason: `Duplicate email within CSV: ${email}` });
        continue;
      }
      seenEmails.add(email);
    } else {
      const key = nameKey(first_name, last_name, phone!);
      if (seenNamePhone.has(key)) {
        outcomes.push({ rowIndex: i, status: 'skipped', reason: 'Duplicate name + phone within CSV' });
        skippedDetails.push({
          row: rowNum,
          reason: `Duplicate name + phone within CSV: ${first_name} ${last_name} ${phone}`.trim(),
        });
        continue;
      }
      seenNamePhone.add(key);
    }

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

  // Two lookups: by email for rows that have one, and by phone so a row
  // without an email can still be matched to someone already on file.
  const emails = valid.map((v) => v.email).filter((e): e is string => e !== null);
  const phones = valid.map((v) => v.phone).filter((p): p is string => p !== null);
  const select =
    'id, email, first_name, last_name, phone, sms_opt_in_event_updates, sms_opt_in_marketing';

  const [byEmailRes, byPhoneRes] = await Promise.all([
    emails.length
      ? supabase.from('master_contacts').select(select).in('email', emails)
      : Promise.resolve({ data: [], error: null }),
    phones.length
      ? supabase.from('master_contacts').select(select).in('phone', phones)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (byEmailRes.error) {
    throw new Error(`Failed to query master_contacts: ${byEmailRes.error.message}`);
  }
  if (byPhoneRes.error) {
    throw new Error(`Failed to query master_contacts: ${byPhoneRes.error.message}`);
  }

  type ExistingRow = NonNullable<typeof byEmailRes.data>[number];

  const existingByEmail = new Map<string, ExistingRow>(
    (byEmailRes.data ?? []).map((r) => [r.email as string, r])
  );
  // Keyed on name+phone, not phone alone — see nameKey(). When two stored
  // contacts somehow share a name and phone, the first one wins; that means
  // an existing duplicate is reused rather than compounded.
  const existingByNamePhone = new Map<string, ExistingRow>();
  for (const r of byPhoneRes.data ?? []) {
    const k = nameKey(
      (r.first_name as string) ?? '',
      (r.last_name as string) ?? '',
      r.phone as string
    );
    if (!existingByNamePhone.has(k)) existingByNamePhone.set(k, r);
  }

  interface Insertable {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    sms_opt_in_event_updates: boolean;
    sms_opt_in_marketing: boolean;
    source: ContactSource;
    contributor_name?: string | null;
  }

  const toInsert: Insertable[] = [];
  const insertMeta: Array<{ rowIndex: number; key: string; email: string | null }> = [];

  interface UpdatePlan {
    id: string;
    rowIndex: number;
    email: string | null;
    fields: Partial<Insertable>;
  }
  const toUpdate: UpdatePlan[] = [];
  let optInEventPromoted = 0;
  let optInMarketingPromoted = 0;
  // An existing contact may only be claimed once per batch, so two rows that
  // resolve to the same person can't both update it.
  const claimedIds = new Set<string>();

  for (const v of valid) {
    // Email wins when present. Otherwise — and also when the email is new but
    // the name+phone is already on file — fall back to the name+phone match so
    // a phone-only list can be imported now and enriched with emails later.
    let existing = v.email ? existingByEmail.get(v.email) : undefined;
    if (!existing && v.phone) {
      const candidate = existingByNamePhone.get(
        nameKey(v.first_name, v.last_name, v.phone)
      );
      if (candidate && !claimedIds.has(candidate.id as string)) existing = candidate;
    }
    if (existing && claimedIds.has(existing.id as string)) existing = undefined;
    if (existing) claimedIds.add(existing.id as string);

    if (!existing) {
      toInsert.push({
        first_name: v.first_name,
        last_name: v.last_name,
        email: v.email,
        phone: v.phone,
        sms_opt_in_event_updates: v.sms_event,
        sms_opt_in_marketing: v.sms_marketing,
        source,
        ...(contributorName ? { contributor_name: contributorName } : {}),
      });
      insertMeta.push({
        rowIndex: v.rowIndex,
        email: v.email,
        key: v.email ?? nameKey(v.first_name, v.last_name, v.phone!),
      });
      continue;
    }

    const fields: Partial<Insertable> = {};
    // Matched by name+phone and the import supplies an email the row lacks:
    // fill it in. Safe against the unique index because a row with this email
    // was already ruled out by the email lookup above.
    if (!existing.email && v.email) fields.email = v.email;
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
        .select('id, email, first_name, last_name, phone');
      if (insertError) {
        throw new Error(`Failed to insert master_contacts: ${insertError.message}`);
      }
      // Keyed the same way insertMeta is, so phone-only rows (no email to key
      // on) still resolve to their new id without relying on RETURNING order.
      const idByKey = new Map(
        (inserted ?? []).map((r) => [
          (r.email as string | null) ??
            nameKey(
              (r.first_name as string) ?? '',
              (r.last_name as string) ?? '',
              (r.phone as string) ?? ''
            ),
          r.id as string,
        ])
      );
      for (const meta of insertMeta) {
        outcomes.push({
          rowIndex: meta.rowIndex,
          status: 'added',
          masterContactId: idByKey.get(meta.key),
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
