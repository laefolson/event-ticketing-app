import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import type { ContactSource, MasterContact } from '@/types/database';

const VALID_SOURCES: ContactSource[] = [
  'manual', 'csv_import', 'google_sheets', 'checkout', 'rsvp',
];

function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const SOURCE_LABEL: Record<ContactSource, string> = {
  manual: 'Manual',
  csv_import: 'CSV import',
  google_sheets: 'Google Sheets',
  checkout: 'Checkout',
  rsvp: 'RSVP',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sp = url.searchParams;

  const q = (sp.get('q') ?? '').trim();
  const optEvent = sp.get('opt_event') === 'yes' ? true : sp.get('opt_event') === 'no' ? false : null;
  const optMarketing =
    sp.get('opt_marketing') === 'yes' ? true : sp.get('opt_marketing') === 'no' ? false : null;
  const sourceParam = sp.get('source');
  const source = VALID_SOURCES.includes(sourceParam as ContactSource)
    ? (sourceParam as ContactSource)
    : null;
  const eventId = sp.get('event_id') && sp.get('event_id') !== 'all' ? sp.get('event_id') : null;

  const supabase = await createClient();

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

  let query = supabase
    .from('master_contacts')
    .select('*')
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

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as MasterContact[];

  const header = [
    'First Name', 'Last Name', 'Email', 'Phone',
    'SMS Event Opt-In', 'SMS Marketing Opt-In', 'Email Opt-Out',
    'Source', 'Notes', 'Created',
  ];

  const lines = [header.map(csvCell).join(',')];
  for (const c of rows) {
    lines.push([
      c.first_name,
      c.last_name,
      c.email,
      c.phone ?? '',
      c.sms_opt_in_event_updates ? 'yes' : 'no',
      c.sms_opt_in_marketing ? 'yes' : 'no',
      c.email_opt_out ? 'yes' : 'no',
      SOURCE_LABEL[c.source],
      c.notes ?? '',
      formatDate(c.created_at, 'yyyy-MM-dd'),
    ].map(csvCell).join(','));
  }
  const csv = lines.join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="master-contacts.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
