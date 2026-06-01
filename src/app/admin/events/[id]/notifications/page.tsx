export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Event } from '@/types/database';
import { NotificationsForm } from './notifications-form';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  if (!event) notFound();
  return <NotificationsForm event={event as Event} />;
}
