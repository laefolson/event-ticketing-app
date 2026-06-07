'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CheckCircle2, Undo2, Download, Check, Minus, AlertTriangle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatPrice } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { deliveryErrorLabel } from '@/lib/delivery-errors';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { ScanDialog } from './scan-dialog';
import { toggleCheckIn, resendTickets } from './actions';
import { Checkbox } from '@/components/ui/checkbox';
import type { PaymentMethod, Ticket } from '@/types/database';

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

interface SmsConsent {
  phone: string;
  consent_type: string;
}

interface AttendeesManagerProps {
  tickets: TicketWithTier[];
  eventId: string;
  smsConsents: SmsConsent[];
  bounceByEmail: Record<string, { status: string; error_code: string | null }>;
}

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
  eventId,
  smsConsents,
  bounceByEmail,
}: AttendeesManagerProps) {
  const router = useRouter();

  // Resend Tickets dialog state — opened from a row, prefills email/phone
  // from the clicked ticket. Bundle size is computed from current
  // tickets[] when the dialog opens so the admin sees how many tickets
  // they're about to resend.
  const [resendTicket, setResendTicket] = useState<TicketWithTier | null>(null);
  const [resendForm, setResendForm] = useState({
    email: '',
    phone: '',
    sendEmail: false,
    sendSms: false,
  });
  const [resendPending, startResend] = useTransition();

  // Search
  const [search, setSearch] = useState('');

  // Per-row check-in pending state
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // Counter — uses quantity, not row count. Refunded tickets stay visible
  // in the list but don't count toward expected attendance.
  const { checkedInCount, expectedCount } = useMemo(() => {
    let checkedIn = 0;
    let expected = 0;
    for (const ticket of tickets) {
      if (ticket.status === 'refunded') continue;
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
      t.status === 'checked_in' ? 'Checked In' : t.status === 'refunded' ? 'Refunded' : 'Confirmed',
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


  // Resend Tickets handlers — opens the dialog prefilled with whatever
  // the ticket currently has, defaulting to whichever channels are
  // available so a single click can re-send.
  function openResend(ticket: TicketWithTier) {
    const email = ticket.attendee_email ?? '';
    const phone = ticket.attendee_phone ?? '';
    setResendTicket(ticket);
    setResendForm({
      email,
      phone,
      sendEmail: !!email,
      sendSms: !!phone,
    });
  }

  function closeResend() {
    if (resendPending) return;
    setResendTicket(null);
  }

  function handleResendSubmit() {
    if (!resendTicket) return;
    startResend(async () => {
      const res = await resendTickets({
        ticketId: resendTicket.id,
        email: resendForm.email ? resendForm.email.trim() : null,
        phone: resendForm.phone ? resendForm.phone.trim() : null,
        sendEmail: resendForm.sendEmail,
        sendSms: resendForm.sendSms,
      });
      if (!res.success) {
        toast.error(res.error ?? 'Failed to resend');
        return;
      }
      const { emailSent, smsSent, ticketsUpdated, bundleSize, deliveryError } = res.data!;
      const parts: string[] = [];
      if (emailSent) parts.push(`Email sent (${bundleSize} ticket${bundleSize === 1 ? '' : 's'})`);
      if (smsSent) parts.push(`SMS sent`);
      if (ticketsUpdated > 0) parts.push(`updated contact info on ${ticketsUpdated} ticket${ticketsUpdated === 1 ? '' : 's'}`);
      if (deliveryError) {
        toast.warning(`${parts.join(' · ')} — ${deliveryError}`);
      } else {
        toast.success(parts.join(' · ') || 'Done');
      }
      setResendTicket(null);
      router.refresh();
    });
  }

  // Bundle size = every confirmed/checked-in ticket in this event with
  // the same current attendee_email. The dialog shows this so the admin
  // knows a multi-ticket purchase will get one resend with all codes.
  const resendBundleSize = useMemo(() => {
    if (!resendTicket || !resendTicket.attendee_email) return 1;
    const email = resendTicket.attendee_email.toLowerCase();
    return tickets.filter(
      (t) =>
        (t.status === 'confirmed' || t.status === 'checked_in') &&
        (t.attendee_email ?? '').toLowerCase() === email
    ).length || 1;
  }, [resendTicket, tickets]);

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
    <TooltipProvider>
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
          <ScanDialog eventId={eventId} />
          <Button variant="outline" onClick={handleExportCsv} disabled={tickets.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
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

      {tickets.length === 0 ? (
        /* Empty state */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No confirmed attendees yet. Tickets show up here once they&rsquo;re
              purchased; you can also create one for a contact from the
              Contacts tab (useful for comps and Venmo payments).
            </p>
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
                    const isRefunded = ticket.status === 'refunded';
                    const isRowPending = pendingIds.has(ticket.id);

                    return (
                      <TableRow key={ticket.id} className={isRefunded ? 'opacity-60' : undefined}>
                        <TableCell className="font-medium">
                          {ticket.attendee_name}
                        </TableCell>
                        <TableCell>
                          {ticket.attendee_email ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span>{ticket.attendee_email}</span>
                              {(() => {
                                const bounce = bounceByEmail[ticket.attendee_email.toLowerCase()];
                                if (!bounce) return null;
                                const reason = deliveryErrorLabel('email', bounce.error_code);
                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-200">
                                        <AlertTriangle className="h-3 w-3" />
                                        Email {bounce.status}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>{reason}</TooltipContent>
                                  </Tooltip>
                                );
                              })()}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
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
                            variant={
                              isRefunded ? 'destructive'
                                : isCheckedIn ? 'default'
                                  : 'secondary'
                            }
                          >
                            {isRefunded ? 'Refunded' : isCheckedIn ? 'Checked In' : 'Confirmed'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {isRefunded ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openResend(ticket)}
                                    disabled={
                                      !ticket.attendee_email && !ticket.attendee_phone
                                    }
                                    aria-label="Resend tickets"
                                  >
                                    <Send className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Resend tickets</TooltipContent>
                              </Tooltip>
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
                            </div>
                          )}
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

      {/* Resend Tickets Dialog */}
      <Dialog open={resendTicket !== null} onOpenChange={(o) => !o && closeResend()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resend tickets</DialogTitle>
            <DialogDescription>
              {resendTicket && (
                <>
                  Resending {resendBundleSize} ticket
                  {resendBundleSize === 1 ? '' : 's'} for{' '}
                  <strong>{resendTicket.attendee_name}</strong>. Edit the email
                  or phone to update the ticket record before sending.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="resend-email">Email</Label>
              <Input
                id="resend-email"
                type="email"
                value={resendForm.email}
                onChange={(e) =>
                  setResendForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="recipient@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resend-phone">Phone</Label>
              <Input
                id="resend-phone"
                type="tel"
                value={resendForm.phone}
                onChange={(e) =>
                  setResendForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="resend-channel-email"
                  checked={resendForm.sendEmail}
                  onCheckedChange={(v) =>
                    setResendForm((f) => ({ ...f, sendEmail: v === true }))
                  }
                  disabled={!resendForm.email.trim()}
                />
                <Label htmlFor="resend-channel-email" className="cursor-pointer text-sm">
                  Send by email
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="resend-channel-sms"
                  checked={resendForm.sendSms}
                  onCheckedChange={(v) =>
                    setResendForm((f) => ({ ...f, sendSms: v === true }))
                  }
                  disabled={!resendForm.phone.trim()}
                />
                <Label htmlFor="resend-channel-sms" className="cursor-pointer text-sm">
                  Send by SMS
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeResend} disabled={resendPending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleResendSubmit}
              disabled={
                resendPending ||
                (!resendForm.sendEmail && !resendForm.sendSms) ||
                (resendForm.sendEmail && !resendForm.email.trim()) ||
                (resendForm.sendSms && !resendForm.phone.trim())
              }
            >
              {resendPending ? 'Sending…' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
