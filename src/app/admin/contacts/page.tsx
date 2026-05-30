export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { ContactsManager } from './contacts-manager';
import type { ContactSource, MasterContact } from '@/types/database';

const VALID_SOURCES: ContactSource[] = [
  'manual', 'csv_import', 'google_sheets', 'checkout', 'rsvp',
];
const PAGE_SIZE = 50;

type SearchParams = {
  q?: string;
  opt_event?: string;     // "yes" | "no"
  opt_marketing?: string; // "yes" | "no"
  source?: string;
  event_id?: string;
  page?: string;
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const optEvent = params.opt_event === 'yes' ? true : params.opt_event === 'no' ? false : null;
  const optMarketing =
    params.opt_marketing === 'yes' ? true : params.opt_marketing === 'no' ? false : null;
  const source = VALID_SOURCES.includes(params.source as ContactSource)
    ? (params.source as ContactSource)
    : null;
  const eventId = params.event_id && params.event_id !== 'all' ? params.event_id : null;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const supabase = await createClient();

  // Events for the "Event attended" dropdown
  const { data: eventsForFilter } = await supabase
    .from('events')
    .select('id, title, date_start')
    .order('date_start', { ascending: false });

  // If filtering by event attended, find master_contact_ids in that event first.
  let restrictToIds: string[] | null = null;
  if (eventId) {
    const { data: rows } = await supabase
      .from('contacts')
      .select('master_contact_id')
      .eq('event_id', eventId)
      .not('master_contact_id', 'is', null);
    restrictToIds = Array.from(new Set((rows ?? []).map((r) => r.master_contact_id as string)));
    if (restrictToIds.length === 0) restrictToIds = ['00000000-0000-0000-0000-000000000000'];
  }

  // Build the master_contacts query with filters, server-side pagination.
  let query = supabase
    .from('master_contacts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (q) {
    const safe = q.replace(/[%,]/g, ' ');
    query = query.or(
      `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`
    );
  }
  if (optEvent !== null) query = query.eq('sms_opt_in_event_updates', optEvent);
  if (optMarketing !== null) query = query.eq('sms_opt_in_marketing', optMarketing);
  if (source) query = query.eq('source', source);
  if (restrictToIds) query = query.in('id', restrictToIds);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data: contacts, count } = await query;
  const masterContacts = (contacts ?? []) as MasterContact[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Per-contact event counts for the visible page
  const eventCountByContactId = new Map<string, number>();
  if (masterContacts.length > 0) {
    const { data: joinRows } = await supabase
      .from('contacts')
      .select('master_contact_id')
      .in('master_contact_id', masterContacts.map((c) => c.id));
    for (const row of joinRows ?? []) {
      const id = row.master_contact_id as string;
      eventCountByContactId.set(id, (eventCountByContactId.get(id) ?? 0) + 1);
    }
  }

  return (
    <ContactsManager
      contacts={masterContacts}
      eventCounts={Object.fromEntries(eventCountByContactId)}
      total={total}
      page={page}
      totalPages={totalPages}
      pageSize={PAGE_SIZE}
      events={(eventsForFilter ?? []).map((e) => ({
        id: e.id as string,
        title: e.title as string,
        date_start: e.date_start as string,
      }))}
      filters={{
        q,
        opt_event: params.opt_event ?? '',
        opt_marketing: params.opt_marketing ?? '',
        source: params.source ?? '',
        event_id: params.event_id ?? '',
      }}
    />
  );
}
