export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ContactsManager } from './contacts-manager';

interface ContactsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ContactsPage({ params }: ContactsPageProps) {
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

  const { data: contacts } = await supabase
    .from('contacts')
    .select(
      `*,
       master_contacts!inner(
         first_name, last_name, email, phone,
         sms_opt_in_event_updates, sms_opt_in_marketing
       )`
    )
    .eq('event_id', id)
    .order('created_at', { ascending: false });

  const { data: csvImports } = await supabase
    .from('csv_imports')
    .select('*')
    .eq('event_id', id)
    .order('imported_at', { ascending: false });

  const { data: priorEventsData } = await supabase
    .from('events')
    .select('id, title')
    .neq('id', id)
    .order('date_start', { ascending: false });

  return (
    <ContactsManager
      contacts={contacts ?? []}
      csvImports={csvImports ?? []}
      eventId={event.id}
      priorEvents={(priorEventsData ?? []).map((e) => ({
        id: e.id as string,
        title: e.title as string,
      }))}
    />
  );
}
