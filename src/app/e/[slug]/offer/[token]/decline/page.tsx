export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { declineWaitlistOffer } from '../actions';

interface DeclinePageProps {
  params: Promise<{ slug: string; token: string }>;
}

export default async function DeclineOfferPage({ params }: DeclinePageProps) {
  const { slug, token } = await params;
  if (!token) notFound();

  const result = await declineWaitlistOffer(token);

  return (
    <div className="mx-auto max-w-lg px-6 py-10 sm:px-8">
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <h1 className="text-lg font-semibold">
            {result.success ? 'Offer declined' : 'Something went wrong'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {result.success
              ? 'Thanks for letting us know. We hope to see you at a future event.'
              : (result.error ?? 'We couldn’t process the decline. Try the link in your email again.')}
          </p>
          <Link
            href={`/e/${slug}`}
            className="text-primary inline-block text-sm underline"
          >
            Back to event
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
