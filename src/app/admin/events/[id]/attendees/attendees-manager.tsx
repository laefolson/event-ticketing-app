'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, QrCode, CheckCircle2, Undo2 } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createWalkIn, toggleCheckIn } from './actions';
import type { Ticket, TicketTier } from '@/types/database';

type TicketWithTier = Ticket & {
  ticket_tiers: { id: string; name: string; price_cents: number } | null;
};

type TierOption = Pick<
  TicketTier,
  'id' | 'name' | 'price_cents' | 'quantity_total' | 'quantity_sold'
>;

interface AttendeesManagerProps {
  tickets: TicketWithTier[];
  tiers: TierOption[];
  eventId: string;
}

const emptyWalkInForm = {
  tier_id: '',
  attendee_name: '',
  attendee_email: '',
  attendee_phone: '',
  quantity: 1,
};

function formatCents(cents: number): string {
  if (cents === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function AttendeesManager({
  tickets,
  tiers,
  eventId,
}: AttendeesManagerProps) {
  const router = useRouter();

  // Walk-in dialog state
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInForm, setWalkInForm] = useState(emptyWalkInForm);
  const [walkInPending, setWalkInPending] = useState(false);
  const [walkInError, setWalkInError] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState('');

  // Per-row check-in pending state
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // Counter — uses quantity, not row count
  const { checkedInCount, expectedCount } = useMemo(() => {
    let checkedIn = 0;
    let expected = 0;
    for (const ticket of tickets) {
      expected += ticket.quantity;
      if (ticket.status === 'checked_in') {
        checkedIn += ticket.quantity;
      }
    }
    return { checkedInCount: checkedIn, expectedCount: expected };
  }, [tickets]);

  const progressPercent =
    expectedCount > 0 ? Math.round((checkedInCount / expectedCount) * 100) : 0;

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    if (!search.trim()) return tickets;
    const q = search.toLowerCase();
    return tickets.filter(
      (t) =>
        t.attendee_name.toLowerCase().includes(q) ||
        (t.attendee_email && t.attendee_email.toLowerCase().includes(q))
    );
  }, [tickets, search]);

  // Walk-in handlers
  function openWalkIn() {
    setWalkInForm(emptyWalkInForm);
    setWalkInError(null);
    setWalkInOpen(true);
  }

  async function handleWalkInSave() {
    setWalkInError(null);
    setWalkInPending(true);

    const result = await createWalkIn(eventId, {
      tier_id: walkInForm.tier_id,
      attendee_name: walkInForm.attendee_name,
      attendee_email: walkInForm.attendee_email || null,
      attendee_phone: walkInForm.attendee_phone || null,
      quantity: walkInForm.quantity,
    });

    setWalkInPending(false);

    if (!result.success) {
      setWalkInError(result.error ?? 'Something went wrong.');
      return;
    }

    setWalkInOpen(false);
    router.refresh();
  }

  // Check-in toggle handler
  async function handleToggle(ticketId: string, currentStatus: string) {
    const newStatus = currentStatus === 'checked_in' ? 'confirmed' : 'checked_in';

    setPendingIds((prev) => new Set(prev).add(ticketId));

    const result = await toggleCheckIn(ticketId, newStatus);

    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(ticketId);
      return next;
    });

    if (!result.success) {
      // Could show a toast here; for now just refresh to get consistent state
      router.refresh();
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          Attendees{' '}
          <span className="text-muted-foreground font-normal">
            ({expectedCount} expected)
          </span>
        </h2>
        <Button onClick={openWalkIn}>
          <Plus className="mr-2 h-4 w-4" />
          Walk-in
        </Button>
      </div>

      {/* Counter card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">
                  {checkedInCount} checked in / {expectedCount} expected
                </span>
                <span className="text-muted-foreground">{progressPercent}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-600 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* QR placeholder */}
      <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-muted-foreground">
        <QrCode className="h-5 w-5 shrink-0" />
        <span className="text-sm">QR code scanning &mdash; coming in Phase 2</span>
      </div>

      {tickets.length === 0 ? (
        /* Empty state */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No confirmed attendees yet. Add a walk-in ticket to get started.
            </p>
            <Button variant="outline" onClick={openWalkIn}>
              <Plus className="mr-2 h-4 w-4" />
              Walk-in
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Search bar */}
          <div className="relative">
            <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Tickets table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Check-In</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-muted-foreground h-24 text-center"
                    >
                      No attendees match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTickets.map((ticket) => {
                    const isCheckedIn = ticket.status === 'checked_in';
                    const isRowPending = pendingIds.has(ticket.id);

                    return (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium">
                          {ticket.attendee_name}
                        </TableCell>
                        <TableCell>{ticket.attendee_email ?? '—'}</TableCell>
                        <TableCell>{ticket.attendee_phone ?? '—'}</TableCell>
                        <TableCell>
                          {ticket.ticket_tiers?.name ?? '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {ticket.quantity}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs">
                            {ticket.ticket_code.slice(0, 8)}…
                          </code>
                        </TableCell>
                        <TableCell>
                          {formatCents(ticket.amount_paid_cents)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(ticket.purchased_at), 'MMM d')}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isCheckedIn ? 'default' : 'secondary'}
                          >
                            {isCheckedIn ? 'Checked In' : 'Confirmed'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant={isCheckedIn ? 'ghost' : 'default'}
                            size="sm"
                            disabled={isRowPending}
                            onClick={() =>
                              handleToggle(ticket.id, ticket.status)
                            }
                          >
                            {isRowPending ? (
                              '…'
                            ) : isCheckedIn ? (
                              <>
                                <Undo2 className="mr-1 h-3.5 w-3.5" />
                                Undo
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                Check In
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Walk-in Dialog */}
      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Walk-in Ticket</DialogTitle>
            <DialogDescription>
              Create a complimentary ticket for a walk-in attendee.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {walkInError && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                {walkInError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="walkin-tier">Tier *</Label>
              <Select
                value={walkInForm.tier_id}
                onValueChange={(val) =>
                  setWalkInForm({ ...walkInForm, tier_id: val })
                }
              >
                <SelectTrigger id="walkin-tier" className="w-full">
                  <SelectValue placeholder="Select a tier" />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name} ({formatCents(tier.price_cents)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="walkin-name">Name *</Label>
              <Input
                id="walkin-name"
                value={walkInForm.attendee_name}
                onChange={(e) =>
                  setWalkInForm({
                    ...walkInForm,
                    attendee_name: e.target.value,
                  })
                }
                placeholder="Jane Smith"
                maxLength={500}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walkin-email">Email</Label>
              <Input
                id="walkin-email"
                type="email"
                value={walkInForm.attendee_email}
                onChange={(e) =>
                  setWalkInForm({
                    ...walkInForm,
                    attendee_email: e.target.value,
                  })
                }
                placeholder="jane@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walkin-phone">Phone</Label>
              <Input
                id="walkin-phone"
                type="tel"
                value={walkInForm.attendee_phone}
                onChange={(e) =>
                  setWalkInForm({
                    ...walkInForm,
                    attendee_phone: e.target.value,
                  })
                }
                placeholder="+1 555-123-4567"
                maxLength={30}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walkin-quantity">Quantity</Label>
              <Input
                id="walkin-quantity"
                type="number"
                min={1}
                value={walkInForm.quantity}
                onChange={(e) =>
                  setWalkInForm({
                    ...walkInForm,
                    quantity: parseInt(e.target.value, 10) || 1,
                  })
                }
              />
            </div>

            <p className="text-muted-foreground text-xs">
              Walk-in tickets are always free ($0).
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWalkInOpen(false)}
              disabled={walkInPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleWalkInSave}
              disabled={
                walkInPending ||
                !walkInForm.tier_id ||
                !walkInForm.attendee_name.trim()
              }
            >
              {walkInPending ? 'Creating...' : 'Create Ticket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
