'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCents } from '@/lib/utils';
import { computeServiceFeeCents } from '@/lib/service-fee';
import { acceptWaitlistOffer } from './actions';

interface OfferCheckoutFormProps {
  slug: string;
  token: string;
  tierName: string;
  tierPriceCents: number;
  quantity: number;
  expiresAt: string;
  prefillName: string;
  prefillEmail: string;
  prefillPhone: string;
  venmoEnabled: boolean;
  passServiceFee: boolean;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'expired';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function OfferCheckoutForm({
  slug,
  token,
  tierName,
  tierPriceCents,
  quantity,
  expiresAt,
  prefillName,
  prefillEmail,
  prefillPhone,
  venmoEnabled,
  passServiceFee,
}: OfferCheckoutFormProps) {
  const expiresMs = new Date(expiresAt).getTime();
  const [now, setNow] = useState<number>(() => Date.now());
  const [name, setName] = useState(prefillName);
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState(prefillPhone);
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'venmo'>('stripe');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Tick the clock once per second so the countdown stays current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, expiresMs - now);
  const remainingLabel = formatRemaining(remainingMs);
  const expired = remainingMs <= 0;

  const subtotalCents = tierPriceCents * quantity;
  const serviceFeeCents =
    passServiceFee && paymentMethod === 'stripe' && subtotalCents > 0
      ? computeServiceFeeCents(subtotalCents)
      : 0;
  const totalCents = subtotalCents + serviceFeeCents;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (expired) return;
    setError(null);
    setSubmitting(true);

    const res = await acceptWaitlistOffer(slug, token, {
      attendee_name: name,
      attendee_email: email,
      attendee_phone: phone,
      payment_method: paymentMethod,
    });

    if (!res.success) {
      setError(res.error ?? 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }
    window.location.href = res.data!.url;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div
        className={`rounded-lg border p-4 text-sm ${
          remainingMs < 60_000 && !expired
            ? 'border-red-300 bg-red-50/60 dark:bg-red-950/30'
            : 'border-input bg-muted/40'
        }`}
      >
        <p className="font-medium">
          Offer {expired ? 'expired' : 'expires in'}{' '}
          {!expired && <span className="font-mono">{remainingLabel}</span>}
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {tierName} &times; {quantity}
          </span>
          <span>{formatCents(subtotalCents)}</span>
        </div>
        {serviceFeeCents > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Card Surcharge</span>
            <span>{formatCents(serviceFeeCents)}</span>
          </div>
        )}
        <div className="border-border flex items-center justify-between border-t pt-2 text-sm font-bold">
          <span>Total</span>
          <span>{formatCents(totalCents)}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="o-name">Name *</Label>
          <Input
            id="o-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="o-email">Email *</Label>
          <Input
            id="o-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="o-phone">Phone</Label>
          <Input
            id="o-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      {venmoEnabled && (
        <div className="space-y-2">
          <Label>Payment method</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('stripe')}
              className={`rounded-lg border p-3 text-sm font-medium transition-colors ${
                paymentMethod === 'stripe'
                  ? 'border-primary bg-primary/5'
                  : 'border-input hover:bg-muted/50'
              }`}
            >
              Pay with Card
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('venmo')}
              className={`rounded-lg border p-3 text-sm font-medium transition-colors ${
                paymentMethod === 'venmo'
                  ? 'border-primary bg-primary/5'
                  : 'border-input hover:bg-muted/50'
              }`}
            >
              {passServiceFee ? 'Pay with Venmo (no surcharge)' : 'Pay with Venmo'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={submitting || expired}
      >
        {expired
          ? 'Offer expired'
          : submitting
            ? paymentMethod === 'venmo'
              ? 'Reserving tickets…'
              : 'Redirecting to payment…'
            : paymentMethod === 'venmo'
              ? `Reserve tickets · ${formatCents(totalCents)}`
              : `Pay ${formatCents(totalCents)}`}
      </Button>
    </form>
  );
}
