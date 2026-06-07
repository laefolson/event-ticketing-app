export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { AttendeesManager } from './attendees-manager';

interface AttendeesPageProps {
  params: Promise<{ id: string }>;
}

export default async function AttendeesPage({ params }: AttendeesPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title')
    .eq('id', id)
    .single();

  if (eventError || !event) {
    notFound();
  }

  const { data: tickets } = await supabase
    .from('tickets')
    .select('*, ticket_tiers(id, name, price_cents)')
    .eq('event_id', id)
    .in('status', ['confirmed', 'checked_in', 'refunded'])
    .order('purchased_at', { ascending: false });

  // RLS on sms_consents is service-role-only, so use service client
  const serviceClient = createServiceClient();
  const { data: smsConsents } = await serviceClient
    .from('sms_consents')
    .select('phone, consent_type')
    .eq('event_id', id);

  // Look up the latest email-channel invitation log per contact in this
  // event, then expose any bounces/failures keyed by attendee email so
  // attendees with a delivery problem can be flagged inline.
  const { data: contactRows } = await supabase
    .from('contacts')
    .select('id, master_contacts!inner(email)')
    .eq('event_id', id);

  const emailByContactId = new Map<string, string>();
  for (const row of contactRows ?? []) {
    const master = Array.isArray(row.master_contacts)
      ? row.master_contacts[0]
      : row.master_contacts;
    const email = (master?.email as string | undefined)?.toLowerCase();
    if (email) emailByContactId.set(row.id as string, email);
  }

  const bounceByEmail: Record<string, { status: string; error_code: string | null }> = {};
  if (emailByContactId.size > 0) {
    const { data: logs } = await supabase
      .from('invitation_logs')
      .select('contact_id, status, error_code, sent_at')
      .eq('event_id', id)
      .eq('channel', 'email')
      .in('contact_id', Array.from(emailByContactId.keys()))
      .order('sent_at', { ascending: false });
    const seen = new Set<string>();
    for (const log of logs ?? []) {
      const cid = log.contact_id as string | null;
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      const status = log.status as string;
      if (status !== 'bounced' && status !== 'failed') continue;
      const email = emailByContactId.get(cid);
      if (!email) continue;
      bounceByEmail[email] = {
        status,
        error_code: (log.error_code as string | null) ?? null,
      };
    }
  }

  return (
    <AttendeesManager
      tickets={tickets ?? []}
      eventId={event.id}
      smsConsents={smsConsents ?? []}
      bounceByEmail={bounceByEmail}
    />
  );
}
