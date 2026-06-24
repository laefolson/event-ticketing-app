export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getEventBySlug } from '../queries';
import { getVenueName } from '@/lib/settings';
import { WaitlistForm } from './waitlist-form';

interface WaitlistPageProps {
  params: Promise<{ slug: string }>;
}

export default async function WaitlistPage({ params }: WaitlistPageProps) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  if (!event) notFound();
  if (!event.waitlist_enabled) notFound();

  const venueName = await getVenueName();

  return (
    <div className="mx-auto max-w-lg px-6 py-10 sm:px-8">
      <Link
        href={`/e/${slug}`}
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to event
      </Link>

      <h1 className="mb-2 text-2xl font-bold">Join the Waitlist</h1>
      <p className="text-muted-foreground mb-8">
        {event.title} is sold out. Add yourself to the waitlist and
        we&apos;ll reach out if additional tickets become available.
      </p>

      <WaitlistForm
        eventId={event.id}
        slug={slug}
        venueName={venueName}
      />
    </div>
  );
}
