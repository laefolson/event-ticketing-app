export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Calendar, MapPin, Hash, Users } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getEventBySlug, getTicketById } from '../queries';
import { TicketCard } from './ticket-card';

interface ConfirmPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string; ticket_id?: string }>;
}

export default async function ConfirmPage({
  params,
  searchParams,
}: ConfirmPageProps) {
  const { slug } = await params;
  const { ticket_id } = await searchParams;

  if (!ticket_id) notFound();

  const ticket = await getTicketById(ticket_id);
  if (!ticket) notFound();

  const event = await getEventBySlug(slug);
  if (!event || event.id !== ticket.event_id) notFound();

  return (
    <div className="mx-auto max-w-lg px-6 py-10 sm:px-8">
      <Link
        href={`/e/${slug}`}
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to event
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold">You&apos;re confirmed!</h1>
          <p className="text-muted-foreground text-sm">
            Your tickets for {event.title} are reserved.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Status</span>
            <Badge variant="secondary" className="capitalize">
              {ticket.status}
            </Badge>
          </div>

          <div className="border-border border-t pt-4 space-y-3">
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">
                Attendee
              </span>
              <p className="font-medium">{ticket.attendee_name}</p>
              {ticket.attendee_email && (
                <p className="text-muted-foreground text-sm">
                  {ticket.attendee_email}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Hash className="text-muted-foreground h-4 w-4" />
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  Ticket Code
                </span>
                <p className="font-mono text-sm font-medium">
                  {ticket.ticket_code}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Users className="text-muted-foreground h-4 w-4" />
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  Tier &amp; Quantity
                </span>
                <p className="text-sm font-medium">
                  {ticket.tier_name} &times; {ticket.quantity}
                </p>
              </div>
            </div>
          </div>

          <div className="border-border border-t pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="text-muted-foreground h-4 w-4" />
              <p className="text-sm">
                {format(new Date(event.date_start), 'EEEE, MMMM d, yyyy · h:mm a')}
              </p>
            </div>

            {event.location_name && (
              <div className="flex items-center gap-2">
                <MapPin className="text-muted-foreground h-4 w-4" />
                <p className="text-sm">{event.location_name}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <TicketCard
        ticketId={ticket.id}
        eventTitle={event.title}
        dateFormatted={format(new Date(event.date_start), 'EEEE, MMMM d, yyyy · h:mm a')}
        locationName={event.location_name}
        attendeeName={ticket.attendee_name}
        tierName={ticket.tier_name}
        quantity={ticket.quantity}
        ticketCode={ticket.ticket_code}
        coverImageUrl={event.cover_image_url}
      />
    </div>
  );
}
