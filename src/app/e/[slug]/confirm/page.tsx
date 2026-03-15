export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Calendar, MapPin, Hash, Users } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getEventBySlug, getTicketById, getTicketsBySessionId } from '../queries';
import { generateQrDataUrl } from '@/lib/qr';
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
  const { session_id, ticket_id } = await searchParams;

  const event = await getEventBySlug(slug);
  if (!event) notFound();

  // Resolve tickets: prefer session_id (multi-ticket), fall back to ticket_id (legacy)
  let tickets: Array<{
    id: string;
    event_id: string;
    attendee_name: string;
    attendee_email: string | null;
    ticket_code: string;
    tier_name: string;
    quantity: number;
    status: string;
    amount_paid_cents: number;
  }>;

  if (session_id) {
    const sessionTickets = await getTicketsBySessionId(session_id);
    if (sessionTickets.length === 0) notFound();
    // Verify all tickets belong to this event
    if (sessionTickets.some((t) => t.event_id !== event.id)) notFound();
    tickets = sessionTickets;
  } else if (ticket_id) {
    const ticket = await getTicketById(ticket_id);
    if (!ticket || ticket.event_id !== event.id) notFound();
    tickets = [ticket];
  } else {
    notFound();
  }

  const firstTicket = tickets[0];
  const dateFormatted = format(new Date(event.date_start), 'EEEE, MMMM d, yyyy · h:mm a');

  // Generate QR data URLs if enabled
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const qrMap = new Map<string, string>();
  if (event.ticket_qr_enabled) {
    for (const ticket of tickets) {
      const verifyUrl = `${baseUrl}/e/${slug}/verify/${ticket.ticket_code}`;
      qrMap.set(ticket.id, await generateQrDataUrl(verifyUrl));
    }
  }

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
              {session_id && firstTicket.status === 'pending' ? 'confirmed' : firstTicket.status}
            </Badge>
          </div>

          <div className="border-border border-t pt-4 space-y-3">
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">
                Attendee
              </span>
              <p className="font-medium">{firstTicket.attendee_name}</p>
              {firstTicket.attendee_email && (
                <p className="text-muted-foreground text-sm">
                  {firstTicket.attendee_email}
                </p>
              )}
            </div>

            {tickets.map((ticket) => (
              <div key={ticket.id} className="space-y-3">
                {event.ticket_qr_enabled && qrMap.has(ticket.id) ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={qrMap.get(ticket.id)!}
                      alt={`QR code for ${ticket.ticket_code}`}
                      className="h-16 w-16"
                    />
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wide">
                        Ticket Code
                      </span>
                      <p className="font-mono text-sm font-medium">
                        {ticket.ticket_code}
                      </p>
                    </div>
                  </div>
                ) : (
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
                )}

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
            ))}
          </div>

          <div className="border-border border-t pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="text-muted-foreground h-4 w-4" />
              <p className="text-sm">{dateFormatted}</p>
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

      {tickets.map((ticket) => (
        <TicketCard
          key={ticket.id}
          ticketId={ticket.id}
          eventTitle={event.title}
          dateFormatted={dateFormatted}
          locationName={event.location_name}
          attendeeName={ticket.attendee_name}
          tierName={ticket.tier_name}
          quantity={ticket.quantity}
          ticketCode={ticket.ticket_code}
          coverImageUrl={event.cover_image_url}
          ticketQrEnabled={event.ticket_qr_enabled}
          qrDataUrl={qrMap.get(ticket.id)}
        />
      ))}
    </div>
  );
}
