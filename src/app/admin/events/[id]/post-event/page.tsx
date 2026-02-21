export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PostEventManager } from './post-event-manager';

interface PostEventPageProps {
  params: Promise<{ id: string }>;
}

export default async function PostEventPage({ params }: PostEventPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, date_end, status, link_active, archived_at')
    .eq('id', id)
    .single();

  if (eventError || !event) {
    notFound();
  }

  // Count eligible tickets (confirmed or checked-in)
  const { count: eligibleTicketCount } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .in('status', ['confirmed', 'checked_in']);

  // Check if thank-you messages were already sent
  const { count: thankYouLogCount } = await supabase
    .from('invitation_logs')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .eq('message_type', 'thank_you');

  return (
    <PostEventManager
      event={event}
      eligibleTicketCount={eligibleTicketCount ?? 0}
      thankYouAlreadySent={(thankYouLogCount ?? 0) > 0}
    />
  );
}
