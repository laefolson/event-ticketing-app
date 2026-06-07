export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ContactsManager } from './contacts-manager';
import { listContributors } from '@/app/admin/contacts/actions';

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

  // Tiers feed the per-contact Create Ticket dialog (the Add Ticket flow
  // moved here from the attendees tab, where it didn't pull its weight).
  const { data: tiers } = await supabase
    .from('ticket_tiers')
    .select('id, name, price_cents, quantity_total, quantity_sold')
    .eq('event_id', id)
    .order('sort_order', { ascending: true });

  // Used by the Send Reminder dialog so the "Invited, no ticket yet"
  // scope count can subtract contacts whose email or phone already
  // appears on a confirmed/checked-in ticket. Mirrors the server-side
  // filter in sendTicketReminders.
  const { data: existingTicketRows } = await supabase
    .from('tickets')
    .select('attendee_email, attendee_phone')
    .eq('event_id', id)
    .in('status', ['confirmed', 'checked_in']);
  const ticketedEmails = Array.from(
    new Set(
      (existingTicketRows ?? [])
        .map((t) => ((t.attendee_email as string | null) ?? '').toLowerCase())
        .filter(Boolean)
    )
  );
  const ticketedPhones = Array.from(
    new Set(
      (existingTicketRows ?? [])
        .map((t) => ((t.attendee_phone as string | null) ?? '').replace(/\D/g, ''))
        .filter(Boolean)
    )
  );

  const pastContributors = await listContributors();

  return (
    <ContactsManager
      contacts={contacts ?? []}
      csvImports={csvImports ?? []}
      eventId={event.id}
      tiers={tiers ?? []}
      ticketedEmails={ticketedEmails}
      ticketedPhones={ticketedPhones}
      priorEvents={(priorEventsData ?? []).map((e) => ({
        id: e.id as string,
        title: e.title as string,
      }))}
      pastContributors={pastContributors}
    />
  );
}
