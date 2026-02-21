export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
    .in('status', ['confirmed', 'checked_in'])
    .order('purchased_at', { ascending: false });

  const { data: tiers } = await supabase
    .from('ticket_tiers')
    .select('id, name, price_cents, quantity_total, quantity_sold')
    .eq('event_id', id)
    .order('sort_order', { ascending: true });

  return (
    <AttendeesManager
      tickets={tickets ?? []}
      tiers={tiers ?? []}
      eventId={event.id}
    />
  );
}
