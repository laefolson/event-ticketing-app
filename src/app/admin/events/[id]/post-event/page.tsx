export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PostEventManager } from './post-event-manager';
import { resolveRecipients } from './recipients';

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

  // Resolve the true recipient list (deduplicated per contact + channel,
  // respecting invitation_channel and walk-in fallbacks) so the header count
  // matches what a send will actually deliver.
  const recipients = await resolveRecipients(supabase, id);
  const emailCount = recipients.filter((r) => r.channel === 'email').length;
  const smsCount = recipients.filter((r) => r.channel === 'sms').length;

  // Check if thank-you messages were already sent
  const { count: thankYouLogCount } = await supabase
    .from('invitation_logs')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .eq('message_type', 'thank_you');

  return (
    <PostEventManager
      event={event}
      recipientCount={recipients.length}
      emailCount={emailCount}
      smsCount={smsCount}
      thankYouAlreadySent={(thankYouLogCount ?? 0) > 0}
    />
  );
}
