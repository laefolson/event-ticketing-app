import { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { EventTabs } from './event-tabs';
import type { EventStatus } from '@/types/database';

function statusVariant(status: EventStatus) {
  switch (status) {
    case 'published':
      return 'default' as const;
    case 'draft':
      return 'secondary' as const;
    case 'cancelled':
      return 'destructive' as const;
    case 'archived':
      return 'outline' as const;
  }
}

interface EventLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export default async function EventLayout({ children, params }: EventLayoutProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: event } = await supabase
    .from('events')
    .select('id, title, status')
    .eq('id', id)
    .single();

  if (!event) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Events
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <Badge variant={statusVariant(event.status)}>
            {event.status}
          </Badge>
        </div>
      </div>

      <EventTabs eventId={event.id} />

      <div className="mt-6">{children}</div>
    </div>
  );
}
