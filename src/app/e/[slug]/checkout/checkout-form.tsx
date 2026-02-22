'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const availableTiers = tiers.filter((t) => t.quantity_sold < t.quantity_total);
  const allSoldOut = availableTiers.length === 0;

  const [selectedTierId, setSelectedTierId] = useState(
    availableTiers.length === 1 ? availableTiers[0].id : ''
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedTier = tiers.find((t) => t.id === selectedTierId);
  const remaining = selectedTier
    ? selectedTier.quantity_total - selectedTier.quantity_sold
    : 0;
  const maxQty = selectedTier
    ? Math.min(remaining, selectedTier.max_per_contact ?? remaining)
    : 1;
  const showTierSelect = tiers.length > 1;
  const showQuantity = maxQty > 1;
  const totalCents = selectedTier ? selectedTier.price_cents * quantity : 0;

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

    if (!selectedTierId) {
      setError('Please select a ticket tier.');
      return;
    }

    setSubmitting(true);

    const result = await createCheckoutSession(slug, {
      event_id: eventId,
      tier_id: selectedTierId,
      attendee_name: name,
      attendee_email: email,
      attendee_phone: phone,
      quantity,
    });

    if (!result.success) {
      setError(result.error ?? 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    // Full navigation to Stripe's hosted checkout
    window.location.href = result.data!.url;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Tier selector */}
      {showTierSelect && (
        <div className="space-y-2">
          <Label htmlFor="tier">Ticket Type</Label>
          <Select value={selectedTierId} onValueChange={(v) => { setSelectedTierId(v); setQuantity(1); }}>
            <SelectTrigger id="tier" className="w-full">
              <SelectValue placeholder="Select a ticket type" />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((tier) => {
                const soldOut = tier.quantity_sold >= tier.quantity_total;
                return (
                  <SelectItem key={tier.id} value={tier.id} disabled={soldOut}>
                    {tier.name} — {formatCents(tier.price_cents)}
                    {soldOut ? ' (Sold Out)' : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Name */}
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

      {/* Email */}
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

      {/* Phone */}
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

      {/* Quantity */}
      {showQuantity && (
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity (max {maxQty})</Label>
          <Input
            id="quantity"
            type="number"
            min={1}
            max={maxQty}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, Number(e.target.value))))}
          />
        </div>
      )}

      {/* Order summary */}
      {selectedTier && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {selectedTier.name} &times; {quantity}
            </span>
            <span className="font-medium">{formatCents(totalCents)}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Submit */}
      <Button type="submit" className="w-full" size="lg" disabled={submitting}>
        {submitting
          ? 'Redirecting to payment...'
          : `Pay ${totalCents > 0 ? formatCents(totalCents) : ''}`}
      </Button>
    </form>
  );
}
