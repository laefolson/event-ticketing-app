export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TiersManager } from './tiers-manager';

interface TicketTiersPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketTiersPage({ params }: TicketTiersPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, capacity')
    .eq('id', id)
    .single();

  if (eventError || !event) {
    notFound();
  }

  const { data: tiers } = await supabase
    .from('ticket_tiers')
    .select('*')
    .eq('event_id', id)
    .order('sort_order', { ascending: true });

  return (
    <TiersManager
      tiers={tiers ?? []}
      eventId={event.id}
      eventCapacity={event.capacity}
    />
  );
}
