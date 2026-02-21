export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Archive, MapPin, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';

export default async function ArchivePage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from('events')
    .select('id, title, date_start, date_end, location_name, archived_at')
    .eq('status', 'archived')
    .order('date_start', { ascending: false });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Event Archive</h1>

      {events && events.length > 0 ? (
        <Card>
          <CardContent className="divide-y">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/admin/archive/${event.id}`}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-medium truncate">{event.title}</span>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>
                      {format(new Date(event.date_start), 'MMM d, yyyy')}
                    </span>
                    {event.location_name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.location_name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {event.archived_at && (
                    <span className="text-sm text-muted-foreground">
                      Archived{' '}
                      {format(new Date(event.archived_at), 'MMM d, yyyy')}
                    </span>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Archive className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No archived events</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
