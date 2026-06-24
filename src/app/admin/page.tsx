export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { CalendarDays, MapPin, ArrowRight, Plus, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatCents } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { EventStatus } from '@/types/database';

const SECTION_LIMIT = 10;

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

interface EventRow {
  id: string;
  title: string;
  date_start: string;
  location_name: string | null;
  status: EventStatus;
  ticketsSold: number;
  publicTicketsSold: number;
  waitlistTicketsSold: number;
  revenue: number;
}

export default async function AdminDashboard() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [
    { data: upcoming },
    { data: past },
    { data: ticketAgg },
    { data: pendingVenmoRows },
  ] = await Promise.all([
    // Upcoming: future date, not archived
    supabase
      .from('events')
      .select('id, title, date_start, location_name, status')
      .neq('status', 'archived')
      .gt('date_start', nowIso)
      .order('date_start', { ascending: true })
      .limit(SECTION_LIMIT),

    // Past: any status, date in the past
    supabase
      .from('events')
      .select('id, title, date_start, location_name, status')
      .lte('date_start', nowIso)
      .order('date_start', { ascending: false })
      .limit(SECTION_LIMIT),

    // All confirmed/checked_in tickets — we'll group per event below.
    supabase
      .from('tickets')
      .select('event_id, quantity, amount_paid_cents, source')
      .in('status', ['confirmed', 'checked_in']),

    // Pending Venmo orders across all events — surface a stat card only
    // if there's at least one waiting for the admin to confirm.
    supabase
      .from('tickets')
      .select('event_id, stripe_session_id')
      .eq('payment_method', 'venmo')
      .eq('status', 'pending'),
  ]);

  const pendingVenmoOrders = new Set(
    (pendingVenmoRows ?? [])
      .map((t) => (t.stripe_session_id as string | null) ?? '')
      .filter(Boolean)
  ).size;
  const firstPendingEventId =
    (pendingVenmoRows ?? [])[0]?.event_id as string | undefined;

  // Per-event metrics map. Split public vs waitlist counts so the
  // dashboard can surface waitlist sales separately when present.
  const byEventId = new Map<
    string,
    { publicTicketsSold: number; waitlistTicketsSold: number; revenue: number }
  >();
  for (const t of ticketAgg ?? []) {
    const existing = byEventId.get(t.event_id) ?? {
      publicTicketsSold: 0,
      waitlistTicketsSold: 0,
      revenue: 0,
    };
    if ((t.source as string | null) === 'waitlist') {
      existing.waitlistTicketsSold += t.quantity ?? 0;
    } else {
      existing.publicTicketsSold += t.quantity ?? 0;
    }
    existing.revenue += t.amount_paid_cents ?? 0;
    byEventId.set(t.event_id, existing);
  }

  function enrich(events: typeof upcoming): EventRow[] {
    return (events ?? []).map((e) => {
      const m =
        byEventId.get(e.id) ??
        { publicTicketsSold: 0, waitlistTicketsSold: 0, revenue: 0 };
      return {
        id: e.id,
        title: e.title,
        date_start: e.date_start,
        location_name: e.location_name,
        status: e.status,
        ticketsSold: m.publicTicketsSold + m.waitlistTicketsSold,
        publicTicketsSold: m.publicTicketsSold,
        waitlistTicketsSold: m.waitlistTicketsSold,
        revenue: m.revenue,
      };
    });
  }

  const upcomingRows = enrich(upcoming);
  const pastRows = enrich(past);

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link
          href="/admin/events/new"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Create Event
        </Link>
      </div>

      {pendingVenmoOrders > 0 && (
        <Link
          href={
            firstPendingEventId
              ? `/admin/events/${firstPendingEventId}/attendees`
              : '/admin/events'
          }
          className="block"
        >
          <Card className="border-amber-300 bg-amber-50/40 transition-colors hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
            <CardContent className="flex items-center gap-4 py-4">
              <Clock className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="flex-1">
                <p className="font-medium">
                  {pendingVenmoOrders} pending Venmo payment
                  {pendingVenmoOrders === 1 ? '' : 's'}
                </p>
                <p className="text-muted-foreground text-sm">
                  Confirm payment to send tickets, or cancel the order.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      <EventsSection
        heading="Upcoming Events"
        rows={upcomingRows}
        emptyMessage="No upcoming events"
      />

      <EventsSection
        heading="Past Events"
        rows={pastRows}
        emptyMessage="No past events yet"
      />

      <div className="flex justify-center">
        <Link
          href="/admin/events"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          View all events
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function EventsSection({
  heading,
  rows,
  emptyMessage,
}: {
  heading: string;
  rows: EventRow[];
  emptyMessage: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{heading}</h2>
      {rows.length > 0 ? (
        <Card>
          <CardContent className="divide-y p-0">
            {rows.map((event) => (
              <Link
                key={event.id}
                href={`/admin/events/${event.id}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{event.title}</span>
                    <Badge variant={statusVariant(event.status)} className="shrink-0">
                      {event.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{formatDate(event.date_start, 'MMM d, yyyy')}</span>
                    {event.location_name && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{event.location_name}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end shrink-0 text-sm">
                  <span className="font-medium">
                    {event.ticketsSold} {event.ticketsSold === 1 ? 'ticket' : 'tickets'}
                  </span>
                  {event.waitlistTicketsSold > 0 && (
                    <span className="text-muted-foreground text-xs">
                      {event.publicTicketsSold} public · {event.waitlistTicketsSold} waitlist
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {formatCents(event.revenue)}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-center text-muted-foreground text-sm">
            <CalendarDays className="h-5 w-5 mx-auto" />
            <span className="flex-1">{emptyMessage}</span>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
