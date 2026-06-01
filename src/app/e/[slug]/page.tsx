import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import Markdown from 'react-markdown';
import { CalendarDays, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatPrice } from '@/lib/utils';
import { extractYouTubeId } from '@/lib/youtube';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ShareButtons } from '@/components/share-buttons';
import { ResendTicketsForm } from './resend-tickets-form';
import { getEventBySlug, getTiersForEvent } from './queries';
import type { TicketTier } from '@/types/database';
import type { Metadata } from 'next';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TimeLine {
  label: string | null;
  text: string;
}

function buildTimeLines(
  date_start: string,
  date_end: string | null,
  start_time_label: string | null,
  additional_times: Array<{ label: string | null; time: string }>
): { dateText: string; lines: TimeLine[]; compactSingleLine: string | null } {
  const sDay = formatDate(date_start, 'yyyy-MM-dd');
  const eDay = date_end ? formatDate(date_end, 'yyyy-MM-dd') : sDay;

  // Multi-day span — keep the legacy compact format on a single line.
  if (date_end && sDay !== eDay) {
    return {
      dateText: '',
      lines: [],
      compactSingleLine: `${formatDate(date_start, 'MMM d, yyyy h:mm a')} – ${formatDate(date_end, 'MMM d, yyyy h:mm a')}`,
    };
  }

  const dateText = formatDate(date_start, 'EEEE, MMMM d, yyyy');

  // Compose the per-slot lines: primary slot + any additional slots, sorted
  // by clock time so the order on the page is sane regardless of input order.
  type Slot = { label: string | null; hhmm: string; sortKey: string };
  const slots: Slot[] = [];
  slots.push({
    label: start_time_label ?? null,
    hhmm: formatDate(date_start, 'h:mm a'),
    sortKey: formatDate(date_start, 'HH:mm'),
  });
  for (const extra of additional_times ?? []) {
    if (!extra?.time) continue;
    slots.push({
      label: extra.label ?? null,
      hhmm: extraTimeTo12h(extra.time),
      sortKey: extra.time,
    });
  }
  slots.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const hasExtras = slots.length > 1;
  const hasAnyLabel = slots.some((s) => s.label);

  // Compact single-line fallback when nothing fancy is set: legacy display.
  if (!hasExtras && !hasAnyLabel && date_end) {
    return {
      dateText: '',
      lines: [],
      compactSingleLine: `${dateText} · ${formatDate(date_start, 'h:mm a')} – ${formatDate(date_end, 'h:mm a')}`,
    };
  }
  if (!hasExtras && !hasAnyLabel && !date_end) {
    return {
      dateText: '',
      lines: [],
      compactSingleLine: `${dateText} · ${formatDate(date_start, 'h:mm a')}`,
    };
  }

  const lines: TimeLine[] = slots.map((s) => ({
    label: s.label,
    text: s.label ? `${s.label} at ${s.hhmm}` : s.hhmm,
  }));
  if (date_end) {
    lines.push({
      label: null,
      text: `Ends at ${formatDate(date_end, 'h:mm a')}`,
    });
  }
  return { dateText, lines, compactSingleLine: null };
}

function extraTimeTo12h(hhmm: string): string {
  // hhmm is the form's "HH:mm" string for an additional time on the same date.
  // Render in 12h with am/pm without touching timezones.
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${m.toString().padStart(2, '0')} ${period}`;
}

function getPriceRange(tiers: TicketTier[]): string {
  if (tiers.length === 0) return 'Free';

  const prices = tiers.map((t) => t.price_cents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  if (max === 0) return 'Free';
  if (min === max) return formatPrice(min);
  if (min === 0) return `Free – ${formatPrice(max)}`;
  return `${formatPrice(min)} – ${formatPrice(max)}`;
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
          <div className="relative aspect-[3/1] w-full overflow-hidden">
            <Image
              src={event.cover_image_url}
              alt={event.title}
              fill
              className="object-cover"
              priority
              sizes="100vw"
            />
            {event.hide_title_on_hero ? (
              <h1 className="sr-only">{event.title}</h1>
            ) : (
              <>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                  <div className="mx-auto max-w-3xl">
                    <h1 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
                      {event.title}
                    </h1>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bg-muted px-6 py-12 sm:px-8 sm:py-16">
            <div className="mx-auto max-w-3xl">
              <h1 className="text-3xl font-bold sm:text-4xl md:text-5xl">{event.title}</h1>
            </div>
          </div>
        )}
      </section>

      <div className="mx-auto max-w-3xl px-6 sm:px-8">
        {/* Event info bar */}
        <section className="border-b py-6">
          {(() => {
            const timeInfo = buildTimeLines(
              event.date_start,
              event.date_end,
              event.start_time_label,
              event.additional_times
            );
            return (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
                <div className="flex items-start gap-2 text-sm">
                  <CalendarDays className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                  {timeInfo.compactSingleLine ? (
                    <span>{timeInfo.compactSingleLine}</span>
                  ) : (
                    <div>
                      <div>{timeInfo.dateText}</div>
                      <ul className="mt-1 space-y-0.5">
                        {timeInfo.lines.map((line, i) => (
                          <li key={i}>{line.text}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {(event.location_name || event.location_address) && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                    <span>{event.location_name ?? event.location_address}</span>
                  </div>
                )}
              </div>
            );
          })()}
          {event.social_sharing_enabled && (
            <div className="mt-4">
              <ShareButtons
                url={`${process.env.NEXT_PUBLIC_SITE_URL}/e/${slug}`}
                title={event.title}
              />
            </div>
          )}
        </section>

        {/* Event Details */}
        {(event.description || tiers.length > 0) && (
          <section className="border-b py-8">
            <h2 className="mb-4 text-xl font-semibold">
              {event.description_heading || 'Event Details'}
            </h2>
            {tiers.length > 0 && (
              <p className="mb-4 text-base">
                <span className="text-muted-foreground">Tickets:</span>{' '}
                <span className="font-semibold">{priceRange}</span>
              </p>
            )}
            {event.description && (
              <div className="prose prose-stone dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
                <Markdown>{event.description}</Markdown>
              </div>
            )}
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

                const cardInner = (
                  <Card
                    className={
                      soldOut
                        ? 'opacity-60'
                        : 'transition-shadow hover:shadow-md focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none'
                    }
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold">{tier.name}</h3>
                        {soldOut ? (
                          <Badge variant="secondary">Sold Out</Badge>
                        ) : (
                          <span className="text-sm font-medium">
                            {formatPrice(tier.price_cents)}
                          </span>
                        )}
                      </div>
                      {tier.description && (
                        <p className="text-muted-foreground mt-2 text-sm">{tier.description}</p>
                      )}
                      <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {!soldOut && <span>{remaining} remaining</span>}
                        {tier.max_per_contact !== null && (
                          <span>Max {tier.max_per_contact} per person</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );

                if (soldOut) {
                  return <div key={tier.id}>{cardInner}</div>;
                }
                return (
                  <Link
                    key={tier.id}
                    href={ctaHref}
                    className="block rounded-lg focus:outline-none"
                    aria-label={`Get ${tier.name} — ${formatPrice(tier.price_cents)}`}
                  >
                    {cardInner}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Gallery */}
        {event.gallery_urls && event.gallery_urls.length > 0 && (
          <section className="border-b py-8">
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

        {/* Video embed (responsive 16:9) — appears below the gallery */}
        {(() => {
          const videoId = extractYouTubeId(event.video_url);
          if (!videoId) return null;
          return (
            <section className="border-b py-8">
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title={`${event.title} video`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </section>
          );
        })()}

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

        {/* Resend tickets */}
        <ResendTicketsForm slug={slug} />

        {/* Legal links */}
        <p className="pb-8 text-center text-xs text-muted-foreground">
          <Link href="/privacy-policy" className="hover:underline">
            Privacy Policy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:underline">
            Terms and Conditions
          </Link>
        </p>
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
