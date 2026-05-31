'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, QrCode, CheckCircle2, Undo2, Download, Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatPrice } from '@/lib/utils';
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
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { createManualTicket, toggleCheckIn } from './actions';
import type { PaymentMethod, Ticket, TicketTier } from '@/types/database';

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'check', label: 'Check' },
  { value: 'comp', label: 'Comp' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: 'Stripe',
  cash: 'Cash',
  venmo: 'Venmo',
  paypal: 'PayPal',
  check: 'Check',
  comp: 'Comp',
  other: 'Other',
};

function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

type TicketWithTier = Ticket & {
  ticket_tiers: { id: string; name: string; price_cents: number } | null;
};

type TierOption = Pick<
  TicketTier,
  'id' | 'name' | 'price_cents' | 'quantity_total' | 'quantity_sold'
>;

interface SmsConsent {
  phone: string;
  consent_type: string;
}

interface AttendeesManagerProps {
  tickets: TicketWithTier[];
  tiers: TierOption[];
  eventId: string;
  smsConsents: SmsConsent[];
}

const emptyAddTicketForm = {
  tier_id: '',
  attendee_name: '',
  attendee_email: '',
  attendee_phone: '',
  quantity: 1,
  amount_dollars: '',
  payment_method: 'cash' as PaymentMethod,
  payment_note: '',
  deliver_email: false,
  deliver_sms: false,
};


function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function AttendeesManager({
  tickets,
  tiers,
  eventId,
  smsConsents,
}: AttendeesManagerProps) {
  const router = useRouter();

  // Add Ticket dialog state
  const [addTicketOpen, setAddTicketOpen] = useState(false);
  const [addTicketForm, setAddTicketForm] = useState(emptyAddTicketForm);
  const [addTicketPending, setAddTicketPending] = useState(false);
  const [addTicketError, setAddTicketError] = useState<string | null>(null);

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

  // Build phone-based consent lookup sets
  const { eventOptInPhones, marketingOptInPhones } = useMemo(() => {
    const eventSet = new Set<string>();
    const marketingSet = new Set<string>();
    for (const consent of smsConsents) {
      const normalized = normalizePhone(consent.phone);
      if (consent.consent_type === 'event_updates') eventSet.add(normalized);
      if (consent.consent_type === 'marketing') marketingSet.add(normalized);
    }
    return { eventOptInPhones: eventSet, marketingOptInPhones: marketingSet };
  }, [smsConsents]);

  function hasConsent(phone: string | null, set: Set<string>): boolean {
    if (!phone) return false;
    return set.has(normalizePhone(phone));
  }

  // CSV export
  function handleExportCsv() {
    const headers = [
      'Name', 'Email', 'Phone', 'Tier', 'Qty', 'Amount Paid', 'Payment Method', 'Payment Note',
      'Status', 'Purchased', 'SMS Event Opt-In', 'SMS Marketing Opt-In',
    ];
    const rows = tickets.map((t) => [
      escapeCsvValue(t.attendee_name),
      escapeCsvValue(t.attendee_email ?? ''),
      escapeCsvValue(t.attendee_phone ?? ''),
      escapeCsvValue(t.ticket_tiers?.name ?? ''),
      String(t.quantity),
      formatPrice(t.amount_paid_cents),
      escapeCsvValue(paymentMethodLabel(t.payment_method)),
      escapeCsvValue(t.payment_note ?? ''),
      t.status === 'checked_in' ? 'Checked In' : 'Confirmed',
      formatDate(t.purchased_at, 'yyyy-MM-dd'),
      hasConsent(t.attendee_phone, eventOptInPhones) ? 'Yes' : 'No',
      hasConsent(t.attendee_phone, marketingOptInPhones) ? 'Yes' : 'No',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendees-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Add Ticket handlers
  function openAddTicket() {
    setAddTicketForm(emptyAddTicketForm);
    setAddTicketError(null);
    setAddTicketOpen(true);
  }

  const selectedTier = tiers.find((t) => t.id === addTicketForm.tier_id);
  const compIsActive = addTicketForm.payment_method === 'comp';

  function handleTierChange(tierId: string) {
    const t = tiers.find((tier) => tier.id === tierId);
    if (!t) {
      setAddTicketForm({ ...addTicketForm, tier_id: tierId });
      return;
    }
    const newDollars = compIsActive
      ? '0.00'
      : ((t.price_cents * addTicketForm.quantity) / 100).toFixed(2);
    setAddTicketForm({ ...addTicketForm, tier_id: tierId, amount_dollars: newDollars });
  }

  function handleQuantityChange(next: number) {
    const q = Math.max(1, next);
    let newDollars = addTicketForm.amount_dollars;
    if (selectedTier && !compIsActive) {
      newDollars = ((selectedTier.price_cents * q) / 100).toFixed(2);
    }
    setAddTicketForm({ ...addTicketForm, quantity: q, amount_dollars: newDollars });
  }

  function toggleComp(on: boolean) {
    if (on) {
      setAddTicketForm({ ...addTicketForm, payment_method: 'comp', amount_dollars: '0.00' });
    } else {
      const refilled = selectedTier
        ? ((selectedTier.price_cents * addTicketForm.quantity) / 100).toFixed(2)
        : '';
      setAddTicketForm({ ...addTicketForm, payment_method: 'cash', amount_dollars: refilled });
    }
  }

  async function handleAddTicketSave() {
    setAddTicketError(null);
    setAddTicketPending(true);

    const dollars = parseFloat(addTicketForm.amount_dollars);
    if (Number.isNaN(dollars) || dollars < 0) {
      setAddTicketError('Enter a valid amount paid.');
      setAddTicketPending(false);
      return;
    }
    const amount_paid_cents = Math.round(dollars * 100);

    const result = await createManualTicket(eventId, {
      tier_id: addTicketForm.tier_id,
      attendee_name: addTicketForm.attendee_name,
      attendee_email: addTicketForm.attendee_email || null,
      attendee_phone: addTicketForm.attendee_phone || null,
      quantity: addTicketForm.quantity,
      amount_paid_cents,
      payment_method: addTicketForm.payment_method,
      payment_note: addTicketForm.payment_note.trim() || null,
      deliver_email: addTicketForm.deliver_email,
      deliver_sms: addTicketForm.deliver_sms,
    });

    setAddTicketPending(false);

    if (!result.success) {
      setAddTicketError(result.error ?? 'Something went wrong.');
      return;
    }

    const data = result.data!;
    const parts: string[] = ['Ticket created'];
    if (data.emailSent) parts.push('email sent');
    if (data.smsSent) parts.push('SMS sent');
    if (data.deliveryError) {
      toast.warning(`${parts.join(' · ')} — ${data.deliveryError}`);
    } else {
      toast.success(parts.join(' · '));
    }
    setAddTicketOpen(false);
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportCsv} disabled={tickets.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={openAddTicket}>
            <Plus className="mr-2 h-4 w-4" />
            Add Ticket
          </Button>
        </div>
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
              No confirmed attendees yet. Add a ticket manually to get started.
            </p>
            <Button variant="outline" onClick={openAddTicket}>
              <Plus className="mr-2 h-4 w-4" />
              Add Ticket
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
                  <TableHead>Payment</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead className="text-center">SMS Event</TableHead>
                  <TableHead className="text-center">SMS Marketing</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Check-In</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={12}
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
                          {ticket.payment_method === 'comp' ? (
                            <span className="text-muted-foreground">Comp</span>
                          ) : (
                            <span>
                              {paymentMethodLabel(ticket.payment_method)}
                              <span className="text-muted-foreground"> · </span>
                              {formatPrice(ticket.amount_paid_cents)}
                            </span>
                          )}
                          {ticket.payment_note && (
                            <div className="text-xs text-muted-foreground truncate max-w-[140px]" title={ticket.payment_note}>
                              {ticket.payment_note}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(ticket.purchased_at, 'MMM d')}
                        </TableCell>
                        <TableCell className="text-center">
                          {hasConsent(ticket.attendee_phone, eventOptInPhones) ? (
                            <Check className="inline h-4 w-4 text-green-600" />
                          ) : (
                            <Minus className="inline h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {hasConsent(ticket.attendee_phone, marketingOptInPhones) ? (
                            <Check className="inline h-4 w-4 text-green-600" />
                          ) : (
                            <Minus className="inline h-4 w-4 text-muted-foreground" />
                          )}
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

      {/* Add Ticket Dialog */}
      <Dialog open={addTicketOpen} onOpenChange={setAddTicketOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Ticket</DialogTitle>
            <DialogDescription>
              Record a manual sale or comp. The ticket can be delivered by email and/or SMS.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {addTicketError && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                {addTicketError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="addticket-tier">Tier *</Label>
              <Select value={addTicketForm.tier_id} onValueChange={handleTierChange}>
                <SelectTrigger id="addticket-tier" className="w-full">
                  <SelectValue placeholder="Select a tier" />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name} ({formatPrice(tier.price_cents)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="addticket-name">Name *</Label>
                <Input
                  id="addticket-name"
                  value={addTicketForm.attendee_name}
                  onChange={(e) =>
                    setAddTicketForm({ ...addTicketForm, attendee_name: e.target.value })
                  }
                  placeholder="Jane Smith"
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addticket-quantity">Quantity</Label>
                <Input
                  id="addticket-quantity"
                  type="number"
                  min={1}
                  value={addTicketForm.quantity}
                  onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10) || 1)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="addticket-email">Email</Label>
                <Input
                  id="addticket-email"
                  type="email"
                  value={addTicketForm.attendee_email}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAddTicketForm((f) => ({
                      ...f,
                      attendee_email: next,
                      deliver_email: next && !f.attendee_email ? true : f.deliver_email,
                    }));
                  }}
                  placeholder="jane@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addticket-phone">Phone</Label>
                <Input
                  id="addticket-phone"
                  type="tel"
                  value={addTicketForm.attendee_phone}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAddTicketForm((f) => ({
                      ...f,
                      attendee_phone: next,
                      deliver_sms: next && !f.attendee_phone ? true : f.deliver_sms,
                    }));
                  }}
                  placeholder="(555) 123-4567"
                  maxLength={30}
                />
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="addticket-comp" className="cursor-pointer">
                  Comp this ticket
                </Label>
                <Switch
                  id="addticket-comp"
                  checked={compIsActive}
                  onCheckedChange={toggleComp}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="addticket-amount" className="text-xs">Amount paid ($)</Label>
                  <Input
                    id="addticket-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={addTicketForm.amount_dollars}
                    onChange={(e) =>
                      setAddTicketForm({ ...addTicketForm, amount_dollars: e.target.value })
                    }
                    disabled={compIsActive}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="addticket-method" className="text-xs">Payment method</Label>
                  <Select
                    value={addTicketForm.payment_method}
                    onValueChange={(val) =>
                      setAddTicketForm({ ...addTicketForm, payment_method: val as PaymentMethod })
                    }
                  >
                    <SelectTrigger id="addticket-method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="addticket-note" className="text-xs">Payment note (optional)</Label>
                <Input
                  id="addticket-note"
                  value={addTicketForm.payment_note}
                  onChange={(e) =>
                    setAddTicketForm({ ...addTicketForm, payment_note: e.target.value })
                  }
                  placeholder="@venmo-handle / check #1234 / comp from John"
                  maxLength={500}
                />
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">Deliver ticket via</p>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-stone-300"
                    checked={addTicketForm.deliver_email}
                    disabled={!addTicketForm.attendee_email}
                    onChange={(e) =>
                      setAddTicketForm({ ...addTicketForm, deliver_email: e.target.checked })
                    }
                  />
                  Email
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-stone-300"
                    checked={addTicketForm.deliver_sms}
                    disabled={!addTicketForm.attendee_phone}
                    onChange={(e) =>
                      setAddTicketForm({ ...addTicketForm, deliver_sms: e.target.checked })
                    }
                  />
                  SMS
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave both off to record the ticket silently — you can send it later from the attendee&rsquo;s row.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddTicketOpen(false)}
              disabled={addTicketPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddTicketSave}
              disabled={
                addTicketPending ||
                !addTicketForm.tier_id ||
                !addTicketForm.attendee_name.trim() ||
                (!addTicketForm.attendee_email && !addTicketForm.attendee_phone)
              }
            >
              {addTicketPending ? 'Creating…' : 'Create Ticket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
