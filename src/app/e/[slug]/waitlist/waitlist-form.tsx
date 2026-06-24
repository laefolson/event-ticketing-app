'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { joinWaitlist } from './actions';

interface WaitlistFormProps {
  eventId: string;
  slug: string;
  venueName: string;
}

export function WaitlistForm({ eventId, slug, venueName }: WaitlistFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ticketsRequested, setTicketsRequested] = useState(1);
  const [consentEventUpdates, setConsentEventUpdates] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'created' | 'already_on_list' | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await joinWaitlist(slug, {
      event_id: eventId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      tickets_requested: ticketsRequested,
      consent_event_updates: consentEventUpdates,
      consent_marketing: consentMarketing,
    });

    setSubmitting(false);
    if (!res.success) {
      setError(res.error ?? 'Something went wrong. Please try again.');
      return;
    }
    setResult(res.data!.kind);
  }

  if (result === 'already_on_list') {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <h2 className="text-lg font-semibold">You&apos;re already on the waitlist</h2>
          <p className="text-muted-foreground text-sm">
            We&apos;ll be in touch if additional tickets become available.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (result === 'created') {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <h2 className="text-lg font-semibold">Thanks!</h2>
          <p className="text-muted-foreground text-sm">
            We&apos;ll reach out if additional tickets become available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="first-name">First name *</Label>
          <Input
            id="first-name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last-name">Last name *</Label>
          <Input
            id="last-name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
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
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tickets">Number of tickets *</Label>
        <Select
          value={String(ticketsRequested)}
          onValueChange={(v) => setTicketsRequested(parseInt(v, 10))}
        >
          <SelectTrigger id="tickets" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {phone.trim().length > 0 && (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="consent-event"
              checked={consentEventUpdates}
              onCheckedChange={(c) => setConsentEventUpdates(c === true)}
            />
            <label htmlFor="consent-event" className="text-sm leading-tight">
              I agree to receive text messages about this event
            </label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="consent-marketing"
              checked={consentMarketing}
              onCheckedChange={(c) => setConsentMarketing(c === true)}
            />
            <label
              htmlFor="consent-marketing"
              className="text-sm leading-tight"
            >
              I agree to receive text messages about future events from{' '}
              {venueName}
            </label>
          </div>
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button type="submit" className="w-full" size="lg" disabled={submitting}>
        {submitting ? 'Joining waitlist…' : 'Join the Waitlist'}
      </Button>
    </form>
  );
}
