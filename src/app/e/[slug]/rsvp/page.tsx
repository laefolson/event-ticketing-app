import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getEventBySlug, getTiersForEvent } from '../queries';
import { RsvpForm } from './rsvp-form';

interface RSVPPageProps {
  params: Promise<{ slug: string }>;
}

export default async function RSVPPage({ params }: RSVPPageProps) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  if (!event) notFound();

  const tiers = await getTiersForEvent(event.id);

  // Only free events should reach the RSVP page
  const isFreeEvent = tiers.length === 0 || tiers.every((t) => t.price_cents === 0);
  if (!isFreeEvent) notFound();

  return (
    <div className="mx-auto max-w-lg px-6 py-10 sm:px-8">
      <Link
        href={`/e/${slug}`}
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to event
      </Link>

      <h1 className="mb-2 text-2xl font-bold">{event.title}</h1>
      <p className="text-muted-foreground mb-8">
        Reserve your free tickets below.
      </p>

      <RsvpForm eventId={event.id} slug={slug} tiers={tiers} />
    </div>
  );
}
