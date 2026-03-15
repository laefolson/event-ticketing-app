import { notFound } from 'next/navigation';
import { CheckCircle2, Clock, XCircle, Calendar, MapPin, Ticket, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { createServiceClient } from '@/lib/supabase/service';

interface VerifyPageProps {
  params: Promise<{ slug: string; code: string }>;
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  confirmed: { icon: CheckCircle2, color: 'text-green-600', label: 'Confirmed' },
  checked_in: { icon: CheckCircle2, color: 'text-blue-600', label: 'Checked In' },
  pending: { icon: Clock, color: 'text-yellow-600', label: 'Pending' },
  cancelled: { icon: XCircle, color: 'text-red-600', label: 'Cancelled' },
  refunded: { icon: XCircle, color: 'text-red-600', label: 'Refunded' },
};

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { slug, code } = await params;

  const supabase = createServiceClient();

  // Look up the ticket by code
  const { data: ticketData } = await supabase
    .from('tickets')
    .select('*, ticket_tiers!inner(name)')
    .eq('ticket_code', code)
    .single();

  if (!ticketData) notFound();

  const { ticket_tiers, ...ticket } = ticketData as Record<string, unknown> & {
    ticket_tiers: { name: string };
  };

  // Verify the ticket belongs to this event slug
  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, date_start, location_name')
    .eq('id', ticket.event_id as string)
    .single();

  if (!event || event.slug !== slug) notFound();

  const status = ticket.status as string;
  const config = statusConfig[status] ?? statusConfig.pending;
  const StatusIcon = config.icon;
  const dateFormatted = formatDate(event.date_start, 'EEEE, MMMM d, yyyy · h:mm a');

  return (
    <div className="mx-auto max-w-md px-6 py-10 sm:px-8">
      <div className="mb-6 flex items-center gap-3">
        <StatusIcon className={`h-8 w-8 ${config.color}`} />
        <div>
          <h1 className="text-2xl font-bold">Ticket Verification</h1>
          <p className="text-muted-foreground text-sm">{event.title}</p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Status</span>
            <Badge variant="secondary" className="capitalize">
              {config.label}
            </Badge>
          </div>

          <div className="border-border border-t pt-4 space-y-3">
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">
                Attendee
              </span>
              <p className="font-medium">{ticket.attendee_name as string}</p>
            </div>

            <div className="flex items-center gap-2">
              <Ticket className="text-muted-foreground h-4 w-4" />
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  Tier
                </span>
                <p className="text-sm font-medium">{ticket_tiers.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Users className="text-muted-foreground h-4 w-4" />
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  Quantity
                </span>
                <p className="text-sm font-medium">{ticket.quantity as number}</p>
              </div>
            </div>

            <div className="font-mono text-sm text-muted-foreground">
              {ticket.ticket_code as string}
            </div>
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
    </div>
  );
}
