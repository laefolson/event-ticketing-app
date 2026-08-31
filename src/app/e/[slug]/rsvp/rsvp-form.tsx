'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { submitRsvp } from './actions';
import { guestNotesLabel, RSVP_GUEST_NOTES_MAX_LENGTH } from '@/lib/rsvp';
import type { TicketTier } from '@/types/database';

interface RsvpFormProps {
  eventId: string;
  slug: string;
  tiers: TicketTier[];
  venueName: string;
  guestNotesEnabled: boolean;
  guestNotesLabel: string | null;
  guestNotesRequired: boolean;
}

/**
 * Seats one guest may reserve: whichever binds first, the tier's remaining
 * stock or its per-guest cap. Returns 1 when no tier is selected yet.
 */
function maxQtyForTier(tier: TicketTier | undefined): number {
  if (!tier) return 1;
  const remaining = tier.quantity_total - tier.quantity_sold;
  return Math.min(remaining, tier.max_per_contact ?? remaining);
}

export function RsvpForm({
  eventId,
  slug,
  tiers,
  venueName,
  guestNotesEnabled,
  guestNotesLabel: guestNotesLabelProp,
  guestNotesRequired,
}: RsvpFormProps) {
  const router = useRouter();

  const availableTiers = tiers.filter((t) => t.quantity_sold < t.quantity_total);
  const allSoldOut = availableTiers.length === 0;

  const [selectedTierId, setSelectedTierId] = useState(
    availableTiers.length === 1 ? availableTiers[0].id : ''
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [guestNotes, setGuestNotes] = useState('');
  const [consentEventUpdates, setConsentEventUpdates] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedTier = tiers.find((t) => t.id === selectedTierId);
  const maxQty = maxQtyForTier(selectedTier);
  const showTierSelect = tiers.length > 1;
  const showQuantity = maxQty > 1;
  const notesLabel = guestNotesLabel(guestNotesLabelProp);

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

    if (guestNotesEnabled && guestNotesRequired && !guestNotes.trim()) {
      setError(`Please answer: ${notesLabel}`);
      return;
    }

    setSubmitting(true);

    const result = await submitRsvp(slug, {
      event_id: eventId,
      tier_id: selectedTierId,
      attendee_name: name,
      attendee_email: email,
      attendee_phone: phone,
      quantity,
      guest_notes: guestNotesEnabled ? guestNotes : '',
      consent_event_updates: consentEventUpdates,
      consent_marketing: consentMarketing,
    });

    if (!result.success) {
      setError(result.error ?? 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    router.push(`/e/${slug}/confirm?ticket_id=${result.data!.ticketId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Tier selector */}
      {showTierSelect && (
        <div className="space-y-2">
          <Label htmlFor="tier">Ticket Type</Label>
          <Select
            value={selectedTierId}
            onValueChange={(id) => {
              setSelectedTierId(id);
              const nextMax = maxQtyForTier(tiers.find((t) => t.id === id));
              setQuantity((q) => Math.min(Math.max(1, q), Math.max(1, nextMax)));
            }}
          >
            <SelectTrigger id="tier" className="w-full">
              <SelectValue placeholder="Select a ticket type" />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((tier) => {
                const soldOut = tier.quantity_sold >= tier.quantity_total;
                return (
                  <SelectItem key={tier.id} value={tier.id} disabled={soldOut}>
                    {tier.name}
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

      {/* Party size — kept next to the guest-notes prompt so "how many" and
          "who" read as one question, rather than being split by the SMS
          consent copy further down. */}
      {showQuantity && (
        <div className="space-y-2">
          <Label id="quantity-label">How many are attending? (max {maxQty})</Label>
          <div
            role="group"
            aria-labelledby="quantity-label"
            className="flex items-center gap-3"
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label="One fewer attendee"
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span
              aria-live="polite"
              className="w-8 text-center text-base font-medium tabular-nums"
            >
              {quantity}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label="One more attendee"
              disabled={quantity >= maxQty}
              onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Guest notes — per-event opt-in */}
      {guestNotesEnabled && (
        <div className="space-y-2">
          <Label htmlFor="guest_notes">
            {notesLabel}
            {guestNotesRequired ? (
              <span className="text-destructive"> *</span>
            ) : (
              <span className="text-muted-foreground font-normal"> (optional)</span>
            )}
          </Label>
          <Textarea
            id="guest_notes"
            rows={3}
            required={guestNotesRequired}
            maxLength={RSVP_GUEST_NOTES_MAX_LENGTH}
            value={guestNotes}
            onChange={(e) => setGuestNotes(e.target.value)}
            placeholder="e.g. Jane Smith, plus Emma (8) and Noah (5)"
          />
        </div>
      )}

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
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
          <p className="text-xs text-muted-foreground leading-relaxed pl-6">
            By checking this box, you consent to receive text messages from Over
            Yonder Farm regarding your ticket purchase and the event you are
            attending. Messages may include order confirmations, event reminders,
            day-of logistics, and material event updates. Message frequency
            varies per event, typically 2–4 messages per event. Message and data
            rates may apply. Reply STOP to opt out at any time. View our{' '}
            <a
              href="/privacy-policy"
              className="underline hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>{' '}
            and{' '}
            <a
              href="/terms"
              className="underline hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms and Conditions
            </a>
            .
          </p>
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
              I agree to receive text messages about future events from {venueName}
            </label>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed pl-6">
            Get a text when we have an upcoming event — typically 2–4 times a
            year, that&apos;s it. We&apos;ll never share or sell your number.
            Message and data rates may apply. Reply STOP anytime.{' '}
            <a
              href="/privacy-policy"
              className="underline hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Submit */}
      <Button type="submit" className="w-full" size="lg" disabled={submitting}>
        {submitting ? 'Reserving...' : 'Reserve Tickets'}
      </Button>
    </form>
  );
}
