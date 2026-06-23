'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Clock, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatDate, formatPrice } from '@/lib/utils';
import { confirmVenmoOrder, cancelVenmoOrder } from './actions';
import type { Ticket } from '@/types/database';

type VenmoTicket = Ticket & {
  ticket_tiers: { id: string; name: string; price_cents: number } | null;
};

interface VenmoOrder {
  sessionId: string;
  attendeeName: string;
  attendeeEmail: string | null;
  attendeePhone: string | null;
  totalTickets: number;
  totalCents: number;
  oldestPurchasedAt: string;
  tierSummary: string;
}

interface PendingVenmoPanelProps {
  tickets: VenmoTicket[];
  eventId: string;
  venmoHandle: string;
}

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

function timeAgo(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PendingVenmoPanel({
  tickets,
  eventId,
  venmoHandle,
}: PendingVenmoPanelProps) {
  const router = useRouter();
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Capture "now" at mount so render is pure. Staleness threshold is 48
  // hours, so refreshing only on remount is plenty.
  const [now] = useState(() => Date.now());

  const orders = useMemo<VenmoOrder[]>(() => {
    const bySession = new Map<string, VenmoTicket[]>();
    for (const t of tickets) {
      const sid = t.stripe_session_id ?? '';
      if (!sid) continue;
      const list = bySession.get(sid) ?? [];
      list.push(t);
      bySession.set(sid, list);
    }
    const result: VenmoOrder[] = [];
    for (const [sessionId, list] of bySession.entries()) {
      const first = list[0];
      const totalTickets = list.reduce((sum, t) => sum + (t.quantity ?? 0), 0);
      const totalCents = list.reduce((sum, t) => sum + (t.amount_paid_cents ?? 0), 0);
      const tierSummary = list
        .map((t) => `${t.ticket_tiers?.name ?? 'Ticket'} ×${t.quantity}`)
        .join(', ');
      const oldest = list
        .map((t) => t.purchased_at)
        .sort()[0];
      result.push({
        sessionId,
        attendeeName: first.attendee_name,
        attendeeEmail: first.attendee_email,
        attendeePhone: first.attendee_phone,
        totalTickets,
        totalCents,
        oldestPurchasedAt: oldest,
        tierSummary,
      });
    }
    return result.sort((a, b) =>
      a.oldestPurchasedAt < b.oldestPurchasedAt ? -1 : 1
    );
  }, [tickets]);

  if (orders.length === 0) return null;

  function handleConfirm(sessionId: string, name: string) {
    setPendingSessionId(sessionId);
    startTransition(async () => {
      const res = await confirmVenmoOrder({ sessionId, eventId });
      setPendingSessionId(null);
      if (!res.success) {
        toast.error(res.error ?? 'Failed to confirm payment');
        return;
      }
      toast.success(`Confirmed ${name}'s order — tickets sent.`);
      router.refresh();
    });
  }

  function handleCancel(sessionId: string, name: string) {
    if (
      !confirm(`Cancel ${name}'s pending Venmo order? A cancellation email will be sent.`)
    ) {
      return;
    }
    setPendingSessionId(sessionId);
    startTransition(async () => {
      const res = await cancelVenmoOrder({ sessionId, eventId });
      setPendingSessionId(null);
      if (!res.success) {
        toast.error(res.error ?? 'Failed to cancel order');
        return;
      }
      toast.success(`Cancelled ${name}'s order.`);
      router.refresh();
    });
  }

  return (
    <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/30">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <h3 className="font-semibold">
              Pending Venmo Payments ({orders.length})
            </h3>
            <p className="text-muted-foreground text-sm">
              Confirm each order after verifying receipt of payment to{' '}
              <span className="font-mono">{venmoHandle}</span>.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {orders.map((order) => {
            const isStale =
              now - new Date(order.oldestPurchasedAt).getTime() >
              STALE_THRESHOLD_MS;
            const isBusy = pendingSessionId === order.sessionId;
            return (
              <div
                key={order.sessionId}
                className="rounded-lg border bg-background p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{order.attendeeName}</p>
                      {isStale && (
                        <Badge
                          variant="destructive"
                          className="gap-1"
                          title="Pending more than 48 hours"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {'>'}48h
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {order.attendeeEmail ?? '—'}
                      {order.attendeePhone && (
                        <>
                          <span className="mx-1.5">·</span>
                          {order.attendeePhone}
                        </>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {order.tierSummary} · ordered {timeAgo(order.oldestPurchasedAt, now)}{' '}
                      ({formatDate(order.oldestPurchasedAt, 'MMM d, h:mm a')})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold">
                      {formatPrice(order.totalCents)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {order.totalTickets} ticket{order.totalTickets === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleCancel(order.sessionId, order.attendeeName)}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Cancel Order
                  </Button>
                  <Button
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleConfirm(order.sessionId, order.attendeeName)}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    {isBusy ? 'Working…' : 'Confirm Payment'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
