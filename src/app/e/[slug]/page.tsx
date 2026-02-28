import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import Markdown from 'react-markdown';
import { CalendarDays, MapPin } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ShareButtons } from '@/components/share-buttons';
import { getEventBySlug, getTiersForEvent } from './queries';
import type { TicketTier } from '@/types/database';
import type { Metadata } from 'next';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  if (cents === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);

  if (isSameDay(s, e)) {
    return `${format(s, 'EEEE, MMMM d, yyyy')} · ${format(s, 'h:mm a')} – ${format(e, 'h:mm a')}`;
  }

  return `${format(s, 'MMM d, yyyy h:mm a')} – ${format(e, 'MMM d, yyyy h:mm a')}`;
}

function getPriceRange(tiers: TicketTier[]): string {
  if (tiers.length === 0) return 'Free';

  const prices = tiers.map((t) => t.price_cents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  if (max === 0) return 'Free';
  if (min === max) return formatCents(min);
  if (min === 0) return `Free – ${formatCents(max)}`;
  return `${formatCents(min)} – ${formatCents(max)}`;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

interface EventPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  if (!event) {
    return {
      title: 'Event Not Found',
      robots: { index: false, follow: false },
    };
  }

  const description = event.description
    ? event.description.length > 160
      ? event.description.slice(0, 157) + '...'
      : event.description
    : `${event.title} — Get your tickets now.`;

  return {
    title: event.title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: event.title,
      description,
      ...(event.cover_image_url ? { images: [{ url: event.cover_image_url }] } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  if (!event) notFound();

  const tiers = await getTiersForEvent(event.id);

  const isFreeEvent = tiers.length === 0 || tiers.every((t) => t.price_cents === 0);
  const allSoldOut = tiers.length > 0 && tiers.every((t) => t.quantity_sold >= t.quantity_total);
  const ctaHref = isFreeEvent ? `/e/${slug}/rsvp` : `/e/${slug}/checkout`;
  const ctaLabel = allSoldOut ? 'Sold Out' : isFreeEvent ? 'RSVP Now' : 'Get Tickets';
  const priceRange = getPriceRange(tiers);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Hero */}
      <section className="relative">
        {event.cover_image_url ? (
          <div className="relative h-64 sm:h-80 md:h-96">
            <Image
              src={event.cover_image_url}
              alt={event.title}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <div className="mx-auto max-w-3xl">
                <h1 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
                  {event.title}
                </h1>
                <p className="mt-2 text-lg font-medium text-white/90">{priceRange}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-muted px-6 py-12 sm:px-8 sm:py-16">
            <div className="mx-auto max-w-3xl">
              <h1 className="text-3xl font-bold sm:text-4xl md:text-5xl">{event.title}</h1>
              <p className="text-muted-foreground mt-2 text-lg font-medium">{priceRange}</p>
            </div>
          </div>
        )}
      </section>

      <div className="mx-auto max-w-3xl px-6 sm:px-8">
        {/* Event info bar */}
        <section className="border-b py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="text-muted-foreground h-4 w-4 shrink-0" />
              <span>{formatDateRange(event.date_start, event.date_end)}</span>
            </div>
            {(event.location_name || event.location_address) && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="text-muted-foreground h-4 w-4 shrink-0" />
                <span>{event.location_name ?? event.location_address}</span>
              </div>
            )}
          </div>
          {event.social_sharing_enabled && (
            <div className="mt-4">
              <ShareButtons
                url={`${process.env.NEXT_PUBLIC_SITE_URL}/e/${slug}`}
                title={event.title}
              />
            </div>
          )}
        </section>

        {/* Description */}
        {event.description && (
          <section className="border-b py-8">
            <h2 className="mb-4 text-xl font-semibold">About This Event</h2>
            <div className="prose prose-stone dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
              <Markdown>{event.description}</Markdown>
            </div>
          </section>
        )}

        {/* Ticket Tiers */}
        {tiers.length > 0 && (
          <section className="border-b py-8">
            <h2 className="mb-4 text-xl font-semibold">Tickets</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {tiers.map((tier) => {
                const soldOut = tier.quantity_sold >= tier.quantity_total;
                const remaining = tier.quantity_total - tier.quantity_sold;

                return (
                  <Card key={tier.id} className={soldOut ? 'opacity-60' : undefined}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold">{tier.name}</h3>
                        {soldOut ? (
                          <Badge variant="secondary">Sold Out</Badge>
                        ) : (
                          <span className="text-sm font-medium">
                            {formatCents(tier.price_cents)}
                          </span>
                        )}
                      </div>
                      {tier.description && (
                        <p className="text-muted-foreground mt-2 text-sm">{tier.description}</p>
                      )}
                      <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {!soldOut && (
                          <span>{remaining} remaining</span>
                        )}
                        {tier.max_per_contact !== null && (
                          <span>Max {tier.max_per_contact} per person</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Gallery */}
        {event.gallery_urls && event.gallery_urls.length > 0 && (
          <section className="border-b py-8">
            <h2 className="mb-4 text-xl font-semibold">Gallery</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {event.gallery_urls.map((url, i) => (
                <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-lg">
                  <Image
                    src={url}
                    alt={`${event.title} gallery image ${i + 1}`}
                    fill
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Location / Map */}
        {event.location_address && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
          <section className="border-b py-8">
            <h2 className="mb-4 text-xl font-semibold">Location</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col justify-center">
                {event.location_name && (
                  <p className="font-medium">{event.location_name}</p>
                )}
                <p className="text-muted-foreground mt-1 text-sm">
                  {event.location_address}
                </p>
              </div>
              <div className="aspect-[4/3] overflow-hidden rounded-lg">
                <iframe
                  title="Event location map"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(event.location_address)}`}
                />
              </div>
            </div>
          </section>
        )}

        {/* Host bio */}
        {event.host_bio && (
          <section className="border-b py-8">
            <h2 className="mb-4 text-xl font-semibold">About the Host</h2>
            <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
              {event.host_bio}
            </p>
          </section>
        )}

        {/* FAQ */}
        {event.faq && event.faq.length > 0 && (
          <section className="py-8">
            <h2 className="mb-4 text-xl font-semibold">FAQ</h2>
            <Accordion type="single" collapsible>
              {event.faq.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground whitespace-pre-line">{item.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}
      </div>

      {/* Sticky footer CTA */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3 sm:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{event.title}</p>
            <p className="text-muted-foreground text-xs">{priceRange}</p>
          </div>
          <Button asChild={!allSoldOut} disabled={allSoldOut} size="lg">
            {allSoldOut ? (
              ctaLabel
            ) : (
              <Link href={ctaHref}>{ctaLabel}</Link>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
