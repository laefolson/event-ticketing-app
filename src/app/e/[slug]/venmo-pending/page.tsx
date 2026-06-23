export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCents } from '@/lib/utils';
import { createServiceClient } from '@/lib/supabase/service';
import { getEventBySlug } from '../queries';

interface VenmoPendingPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string }>;
}

export default async function VenmoPendingPage({
  params,
  searchParams,
}: VenmoPendingPageProps) {
  const { slug } = await params;
  const { session_id } = await searchParams;

  if (!session_id || !session_id.startsWith('venmo_')) notFound();

  const event = await getEventBySlug(slug);
  if (!event || !event.venmo_enabled) notFound();

  const supabase = createServiceClient();
  const { data: tickets } = await supabase
    .from('tickets')
    .select('id, event_id, amount_paid_cents, attendee_name, attendee_email, status')
    .eq('stripe_session_id', session_id);

  if (!tickets || tickets.length === 0) notFound();
  if (tickets.some((t) => t.event_id !== event.id)) notFound();

  const total = tickets.reduce((sum, t) => sum + (t.amount_paid_cents ?? 0), 0);
  const attendeeName = tickets[0].attendee_name;
  const attendeeEmail = tickets[0].attendee_email;

  const rawHandle = event.venmo_handle ?? '@Anne-Olson-24';
  const handle = rawHandle.replace(/^@/, '');
  const note = `Over Yonder Farm - ${event.title} - ${attendeeName}`;
  const amountDollars = (total / 100).toFixed(2);
  const venmoDeepLink = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(
    handle
  )}&amount=${amountDollars}&note=${encodeURIComponent(note)}`;
  const venmoWebLink = `https://venmo.com/${handle}`;

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
        <Clock className="h-8 w-8 text-amber-600" />
        <div>
          <h1 className="text-2xl font-bold">Payment pending</h1>
          <p className="text-muted-foreground text-sm">
            Send your Venmo payment to confirm your tickets for {event.title}.
          </p>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-4 p-6">
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              Send to
            </span>
            <p className="text-lg font-semibold">@{handle}</p>
          </div>

          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              Amount
            </span>
            <p className="text-lg font-semibold">{formatCents(total)}</p>
          </div>

          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              Include this note
            </span>
            <p className="rounded-md bg-muted px-3 py-2 text-sm font-mono">
              {note}
            </p>
          </div>

          <a
            href={venmoDeepLink}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-colors"
          >
            Open Venmo
          </a>

          <a
            href={venmoWebLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex w-full items-center justify-center gap-1 text-xs transition-colors"
          >
            On desktop? Open {venmoWebLink}
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-6 text-sm">
          <p className="font-medium">What happens next</p>
          <p className="text-muted-foreground">
            After sending payment, your tickets will be confirmed once we verify
            receipt — typically within a few hours. We&apos;ll email your tickets to{' '}
            {attendeeEmail ?? 'the address you provided'} as soon as payment is
            verified.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
