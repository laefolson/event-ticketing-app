export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { CalendarDays, MapPin, ArrowRight, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EventStatus } from '@/types/database';

const VALID_STATUSES: EventStatus[] = ['draft', 'published', 'archived'];

function statusVariant(status: EventStatus) {
  switch (status) {
    case 'published':
      return 'default' as const;
    case 'draft':
      return 'secondary' as const;
    case 'archived':
      return 'outline' as const;
  }
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const statusFilter = VALID_STATUSES.includes(status as EventStatus)
    ? (status as EventStatus)
    : null;

  const supabase = await createClient();

  let query = supabase
    .from('events')
    .select('id, title, slug, event_type, date_start, location_name, status')
    .order('date_start', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data: events } = await query;

  const filters = [
    { label: 'All', href: '/admin/events', value: null },
    { label: 'Draft', href: '/admin/events?status=draft', value: 'draft' },
    { label: 'Published', href: '/admin/events?status=published', value: 'published' },
    { label: 'Archived', href: '/admin/events?status=archived', value: 'archived' },
  ];

  const emptyMessage = statusFilter ? `No ${statusFilter} events` : 'No events yet';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <Link
          href="/admin/events/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Create Event
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 mb-6">
        {filters.map((filter) => (
          <Link
            key={filter.label}
            href={filter.href}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              statusFilter === filter.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {/* Event list */}
      {events && events.length > 0 ? (
        <Card>
          <CardContent className="divide-y">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/admin/events/${event.id}`}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-medium truncate">{event.title}</span>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{format(new Date(event.date_start), 'MMM d, yyyy')}</span>
                    {event.location_name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.location_name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <Badge variant={statusVariant(event.status)}>
                    {event.status}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">{emptyMessage}</p>
            <Link
              href="/admin/events/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Create Event
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
