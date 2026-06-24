export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { createServiceClient } from '@/lib/supabase/service';
import { getEventBySlug } from '../../queries';
import { OfferCheckoutForm } from './offer-checkout-form';

interface OfferPageProps {
  params: Promise<{ slug: string; token: string }>;
}

function offerStillValid(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > Date.now();
}

export default async function OfferPage({ params }: OfferPageProps) {
  const { slug, token } = await params;
  if (!token) notFound();

  const event = await getEventBySlug(slug);
  if (!event) notFound();

  const service = createServiceClient();
  const { data: entry } = await service
    .from('waitlist_entries')
    .select(
      'id, event_id, master_contact_id, tier_id, tickets_offered, status, offer_expires_at'
    )
    .eq('offer_token', token)
    .maybeSingle();

  if (!entry) notFound();
  if (entry.event_id !== event.id) notFound();

  const isActive =
    entry.status === 'offered' && offerStillValid(entry.offer_expires_at);

  const { data: master } = await service
    .from('master_contacts')
    .select('first_name, last_name, email, phone')
    .eq('id', entry.master_contact_id)
    .single();

  const { data: tier } = entry.tier_id
    ? await service
        .from('ticket_tiers')
        .select('id, name, price_cents')
        .eq('id', entry.tier_id)
        .single()
    : { data: null };

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

      {!isActive ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <h2 className="text-lg font-semibold">
              {entry.status === 'purchased'
                ? 'Tickets already purchased'
                : entry.status === 'declined'
                  ? 'Offer declined'
                  : 'Offer expired'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {entry.status === 'purchased'
                ? 'These tickets were already redeemed.'
                : entry.status === 'declined'
                  ? 'You declined this offer.'
                  : 'This offer is no longer valid. Visit the event page to rejoin the waitlist.'}
            </p>
            <Link
              href={`/e/${slug}`}
              className="text-primary inline-block text-sm underline"
            >
              Back to event
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="bg-amber-50/40 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg p-4 mb-6 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">
                {entry.tickets_offered} ticket
                {entry.tickets_offered === 1 ? '' : 's'} reserved for you
              </p>
              <p className="text-muted-foreground">
                Complete your purchase before the offer expires.
              </p>
            </div>
          </div>

          {tier && master && (
            <OfferCheckoutForm
              slug={slug}
              token={token}
              tierName={tier.name}
              tierPriceCents={tier.price_cents}
              quantity={entry.tickets_offered ?? 1}
              expiresAt={entry.offer_expires_at!}
              prefillName={`${master.first_name ?? ''} ${master.last_name ?? ''}`.trim()}
              prefillEmail={master.email ?? ''}
              prefillPhone={master.phone ?? ''}
              venmoEnabled={event.venmo_enabled}
              passServiceFee={event.pass_service_fee}
            />
          )}
        </>
      )}
    </div>
  );
}
