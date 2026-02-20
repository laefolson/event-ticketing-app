import Link from 'next/link';
import { CalendarDays, DollarSign, Ticket, TrendingUp, MapPin, ArrowRight, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { EventStatus } from '@/types/database';

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

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

export default async function AdminDashboard() {
  const supabase = await createClient();

  // Run all queries in parallel
  const [
    { count: totalEvents },
    { data: ticketAgg },
    { count: upcomingCount },
    { data: upcomingEvents },
  ] = await Promise.all([
    // Total active events (non-archived)
    supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'archived'),

    // Tickets sold + revenue (confirmed or checked_in)
    supabase
      .from('tickets')
      .select('quantity, amount_paid_cents')
      .in('status', ['confirmed', 'checked_in']),

    // Upcoming event count
    supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'archived')
      .gt('date_start', new Date().toISOString()),

    // Upcoming events list (limit 5)
    supabase
      .from('events')
      .select('id, title, slug, date_start, location_name, status')
      .neq('status', 'archived')
      .gt('date_start', new Date().toISOString())
      .order('date_start', { ascending: true })
      .limit(5),
  ]);

  const ticketsSold = ticketAgg?.reduce((sum, t) => sum + (t.quantity ?? 0), 0) ?? 0;
  const revenue = ticketAgg?.reduce((sum, t) => sum + (t.amount_paid_cents ?? 0), 0) ?? 0;

  const stats = [
    {
      title: 'Total Events',
      value: totalEvents ?? 0,
      icon: CalendarDays,
    },
    {
      title: 'Tickets Sold',
      value: ticketsSold.toLocaleString(),
      icon: Ticket,
    },
    {
      title: 'Revenue',
      value: formatCents(revenue),
      icon: DollarSign,
    },
    {
      title: 'Upcoming',
      value: upcomingCount ?? 0,
      icon: TrendingUp,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upcoming events */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Upcoming Events</h2>
        <Link
          href="/admin/events"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          View All Events
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {upcomingEvents && upcomingEvents.length > 0 ? (
        <Card>
          <CardContent className="divide-y">
            {upcomingEvents.map((event) => (
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
            <p className="text-muted-foreground mb-4">No upcoming events</p>
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
