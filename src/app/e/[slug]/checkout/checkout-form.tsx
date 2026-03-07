'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Minus, Plus } from 'lucide-react';
import { createCheckoutSession } from './actions';
import type { TicketTier } from '@/types/database';

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

interface CheckoutFormProps {
  eventId: string;
  slug: string;
  tiers: TicketTier[];
}

export function CheckoutForm({ eventId, slug, tiers }: CheckoutFormProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const tier of tiers) {
      initial[tier.id] = 0;
    }
    return initial;
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consentEventUpdates, setConsentEventUpdates] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allSoldOut = tiers.every((t) => t.quantity_sold >= t.quantity_total);

  // Compute order summary
  const selectedItems = tiers
    .filter((t) => (quantities[t.id] ?? 0) > 0)
    .map((t) => ({
      tier: t,
      qty: quantities[t.id],
      subtotal: t.price_cents * quantities[t.id],
    }));

  const totalCents = selectedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const totalQty = selectedItems.reduce((sum, item) => sum + item.qty, 0);
  const hasSelection = totalQty > 0;
  const isFreeOnly = hasSelection && totalCents === 0;

  function setQty(tierId: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [tierId]: qty }));
  }

  if (allSoldOut) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Badge variant="secondary" className="mb-3 text-base">
            Sold Out
          </Badge>
          <p className="text-muted-foreground">
            All tickets for this event have been claimed.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!hasSelection) {
      setError('Please select at least one ticket.');
      return;
    }

    setSubmitting(true);

    const items = tiers
      .filter((t) => (quantities[t.id] ?? 0) > 0)
      .map((t) => ({ tier_id: t.id, quantity: quantities[t.id] }));

    const result = await createCheckoutSession(slug, {
      event_id: eventId,
      items,
      attendee_name: name,
      attendee_email: email,
      attendee_phone: phone,
      consent_event_updates: consentEventUpdates,
      consent_marketing: consentMarketing,
    });

    if (!result.success) {
      setError(result.error ?? 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    window.location.href = result.data!.url;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Tier selection */}
      <div className="space-y-3">
        <Label>Tickets</Label>
        {tiers.map((tier) => {
          const remaining = tier.quantity_total - tier.quantity_sold;
          const soldOut = remaining <= 0;
          const maxQty = soldOut
            ? 0
            : Math.min(remaining, tier.max_per_contact ?? remaining);
          const qty = quantities[tier.id] ?? 0;

          return (
            <div
              key={tier.id}
              className={`rounded-lg border p-4 ${
                soldOut ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tier.name}</span>
                    {soldOut && (
                      <Badge variant="secondary" className="text-xs">
                        Sold Out
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {tier.price_cents > 0 ? formatCents(tier.price_cents) : 'Free'}
                    {!soldOut && (
                      <span className="ml-2">
                        · {remaining} remaining
                      </span>
                    )}
                  </p>
                  {tier.description && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {tier.description}
                    </p>
                  )}
                </div>

                {/* Quantity stepper */}
                {!soldOut && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={qty <= 0}
                      onClick={() => setQty(tier.id, qty - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">
                      {qty}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={qty >= maxQty}
                      onClick={() => setQty(tier.id, qty + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Attendee info */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
          />
        </div>
      </div>

      {/* SMS consent checkboxes (shown only when phone has value) */}
      {phone.trim().length > 0 && (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="consent-event"
              checked={consentEventUpdates}
              onCheckedChange={(checked) =>
                setConsentEventUpdates(checked === true)
              }
            />
            <label
              htmlFor="consent-event"
              className="text-sm leading-tight"
            >
              I agree to receive text messages about this event
            </label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="consent-marketing"
              checked={consentMarketing}
              onCheckedChange={(checked) =>
                setConsentMarketing(checked === true)
              }
            />
            <label
              htmlFor="consent-marketing"
              className="text-sm leading-tight"
            >
              I agree to receive text messages about future events from Blue
              Barn Events
            </label>
          </div>
        </div>
      )}

      {/* Order summary */}
      {hasSelection && (
        <div className="rounded-lg border p-4 space-y-2">
          {selectedItems.map((item) => (
            <div
              key={item.tier.id}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">
                {item.tier.name} &times; {item.qty}
              </span>
              <span>
                {item.subtotal > 0 ? formatCents(item.subtotal) : 'Free'}
              </span>
            </div>
          ))}
          <div className="border-border flex items-center justify-between border-t pt-2 text-sm font-bold">
            <span>Total</span>
            <span>{totalCents > 0 ? formatCents(totalCents) : 'Free'}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* Submit */}
      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={submitting || !hasSelection}
      >
        {submitting
          ? isFreeOnly
            ? 'Completing RSVP...'
            : 'Redirecting to payment...'
          : isFreeOnly
            ? 'Complete RSVP'
            : `Pay ${formatCents(totalCents)}`}
      </Button>
    </form>
  );
}
