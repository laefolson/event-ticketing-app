export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FaqManager } from './faq-manager';

interface FaqPageProps {
  params: Promise<{ id: string }>;
}

export default async function FaqPage({ params }: FaqPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from('events')
    .select('id, faq')
    .eq('id', id)
    .single();

  if (error || !event) {
    notFound();
  }

  return (
    <FaqManager
      faq={(event.faq as Array<{ question: string; answer: string }>) ?? []}
      eventId={event.id}
    />
  );
}
