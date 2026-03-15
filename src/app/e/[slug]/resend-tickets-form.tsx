'use client';

import { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { resendTickets } from './actions';

export function ResendTicketsForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    startTransition(async () => {
      await resendTickets(slug, email.trim());
      setSubmitted(true);
    });
  }

  return (
    <section className="py-8">
      <div className="rounded-lg border bg-muted/50 p-5">
        <h3 className="text-sm font-semibold">Lost your tickets?</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Enter your email and we&apos;ll resend your confirmation.
        </p>
        {submitted ? (
          <p className="mt-3 text-sm text-green-700 dark:text-green-400">
            If tickets exist for that email, a confirmation has been sent.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="max-w-xs"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
              {isPending ? 'Sending...' : 'Resend'}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
