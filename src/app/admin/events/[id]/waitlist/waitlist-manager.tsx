'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Megaphone, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { formatDate, formatPrice } from '@/lib/utils';
import {
  sendWaitlistOffer,
  skipWaitlistEntry,
  restoreWaitlistEntry,
  messageWaitlist,
} from './actions';

interface TierOption {
  id: string;
  name: string;
  priceCents: number;
}

interface WaitlistRow {
  id: string;
  position: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  ticketsRequested: number;
  ticketsOffered: number | null;
  tierId: string | null;
  status: 'waiting' | 'offered' | 'purchased' | 'expired' | 'declined' | 'skipped';
  offerExpiresAt: string | null;
  createdAt: string;
}

interface WaitlistManagerProps {
  eventId: string;
  eventTitle: string;
  waitlistEnabled: boolean;
  defaultHoldHours: number;
  tiers: TierOption[];
  entries: WaitlistRow[];
  waitlistTicketsSold: number;
}

const STATUS_BADGE: Record<WaitlistRow['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  waiting: { label: 'Waiting', variant: 'secondary' },
  offered: { label: 'Offered', variant: 'default' },
  purchased: { label: 'Purchased', variant: 'default' },
  expired: { label: 'Expired', variant: 'destructive' },
  declined: { label: 'Declined', variant: 'outline' },
  skipped: { label: 'Skipped', variant: 'outline' },
};

const MESSAGE_TEMPLATES: { label: string; subject: string; body: string }[] = [
  {
    label: 'No additional tickets',
    subject: 'Update from {{event_name}}',
    body: 'Hi {{first_name}}, thank you for your interest in {{event_name}}. Unfortunately we are unable to make additional tickets available. We appreciate your support and hope to see you at a future event!',
  },
  {
    label: 'More tickets coming soon',
    subject: 'Update from {{event_name}}',
    body: 'Hi {{first_name}}, good news — we are working on making additional tickets available for {{event_name}}. Stay tuned, we\'ll be in touch soon!',
  },
];

export function WaitlistManager({
  eventId,
  eventTitle,
  waitlistEnabled,
  defaultHoldHours,
  tiers,
  entries,
  waitlistTicketsSold,
}: WaitlistManagerProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Offer dialog
  const [offerEntry, setOfferEntry] = useState<WaitlistRow | null>(null);
  const [offerTierId, setOfferTierId] = useState('');
  const [offerQuantity, setOfferQuantity] = useState(1);
  const [offerHoldHours, setOfferHoldHours] = useState(defaultHoldHours);

  // Selection + message dialog
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageRecipientMode, setMessageRecipientMode] = useState<
    'all' | 'waiting' | 'expired_declined' | 'selected'
  >('all');
  const [messageChannel, setMessageChannel] = useState<'email' | 'sms' | 'both'>('email');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  const summary = useMemo(() => {
    const totalOnList = entries.length;
    const ticketsRequested = entries.reduce((sum, e) => sum + e.ticketsRequested, 0);
    const activeOffers = entries.filter((e) => e.status === 'offered').length;
    return { totalOnList, ticketsRequested, activeOffers };
  }, [entries]);

  const messageRecipients = useMemo(() => {
    switch (messageRecipientMode) {
      case 'all':
        return entries;
      case 'waiting':
        return entries.filter((e) => e.status === 'waiting');
      case 'expired_declined':
        return entries.filter((e) => e.status === 'expired' || e.status === 'declined');
      case 'selected':
        return entries.filter((e) => selectedIds.has(e.id));
    }
  }, [entries, messageRecipientMode, selectedIds]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openOfferDialog(entry: WaitlistRow) {
    setOfferEntry(entry);
    setOfferTierId(tiers[0]?.id ?? '');
    setOfferQuantity(entry.ticketsRequested);
    setOfferHoldHours(defaultHoldHours);
  }

  function handleSendOffer() {
    if (!offerEntry || !offerTierId) return;
    setBusyId(offerEntry.id);
    startTransition(async () => {
      const res = await sendWaitlistOffer({
        entryId: offerEntry.id,
        eventId,
        tierId: offerTierId,
        ticketsOffered: offerQuantity,
        holdHours: offerHoldHours,
      });
      setBusyId(null);
      if (!res.success) {
        toast.error(res.error ?? 'Failed to send offer');
        return;
      }
      toast.success(`Offer sent to ${offerEntry.firstName} ${offerEntry.lastName}`);
      setOfferEntry(null);
      router.refresh();
    });
  }

  function handleSkip(entry: WaitlistRow) {
    setBusyId(entry.id);
    startTransition(async () => {
      const res = await skipWaitlistEntry({ entryId: entry.id });
      setBusyId(null);
      if (!res.success) toast.error(res.error ?? 'Failed');
      else router.refresh();
    });
  }

  function handleRestore(entry: WaitlistRow) {
    setBusyId(entry.id);
    startTransition(async () => {
      const res = await restoreWaitlistEntry({ entryId: entry.id });
      setBusyId(null);
      if (!res.success) toast.error(res.error ?? 'Failed');
      else router.refresh();
    });
  }

  async function handleSendCustom() {
    if (!messageBody.trim()) {
      toast.error('Message body is required');
      return;
    }
    if (messageRecipients.length === 0) {
      toast.error('No recipients selected');
      return;
    }
    setMessageSending(true);
    const res = await messageWaitlist({
      eventId,
      entryIds: messageRecipients.map((e) => e.id),
      channel: messageChannel,
      subject: messageSubject.trim() || undefined,
      body: messageBody.trim(),
    });
    setMessageSending(false);
    if (!res.success) {
      toast.error(res.error ?? 'Failed to send');
      return;
    }
    const r = res.data!;
    const parts = [
      r.emailSent > 0 ? `${r.emailSent} email${r.emailSent === 1 ? '' : 's'}` : null,
      r.smsSent > 0 ? `${r.smsSent} SMS` : null,
      r.skipped > 0 ? `${r.skipped} skipped` : null,
      r.failed > 0 ? `${r.failed} failed` : null,
    ].filter(Boolean);
    toast.success(parts.join(' · ') || 'Done');
    setMessageOpen(false);
    setMessageBody('');
    setMessageSubject('');
    setSelectedIds(new Set());
    router.refresh();
  }

  function applyTemplate(idx: number) {
    const tmpl = MESSAGE_TEMPLATES[idx];
    if (!tmpl) return;
    setMessageSubject(tmpl.subject);
    setMessageBody(tmpl.body);
  }

  // Preview the message with the first recipient's values
  const firstRecipient = messageRecipients[0];
  const previewBody = firstRecipient
    ? messageBody
        .replace(/\{\{\s*first_name\s*\}\}/gi, firstRecipient.firstName || 'there')
        .replace(/\{\{\s*last_name\s*\}\}/gi, firstRecipient.lastName)
        .replace(/\{\{\s*event_name\s*\}\}/gi, eventTitle)
    : messageBody;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Waitlist</h2>
        <Button variant="outline" onClick={() => setMessageOpen(true)}>
          <Megaphone className="mr-2 h-4 w-4" />
          Message Waitlist
        </Button>
      </div>

      {!waitlistEnabled && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/30">
          <CardContent className="py-4 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>
              Waitlist is disabled for this event. Turn it on in Details to
              accept new signups.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Total on waitlist
            </p>
            <p className="text-2xl font-bold">{summary.totalOnList}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Tickets requested
            </p>
            <p className="text-2xl font-bold">{summary.ticketsRequested}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Waitlist tickets sold
            </p>
            <p className="text-2xl font-bold">{waitlistTicketsSold}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Active offers
            </p>
            <p className="text-2xl font-bold">{summary.activeOffers}</p>
          </CardContent>
        </Card>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No one has joined the waitlist yet.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-center">Requested</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const isBusy = busyId === entry.id;
                const badge = STATUS_BADGE[entry.status];
                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(entry.id)}
                        onCheckedChange={() => toggleSelected(entry.id)}
                        aria-label={`Select ${entry.firstName}`}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {entry.position}
                    </TableCell>
                    <TableCell className="font-medium">
                      {entry.firstName} {entry.lastName}
                    </TableCell>
                    <TableCell className="text-sm">{entry.email}</TableCell>
                    <TableCell className="text-sm">{entry.phone ?? '—'}</TableCell>
                    <TableCell className="text-center">
                      {entry.ticketsRequested}
                      {entry.ticketsOffered !== null &&
                        entry.ticketsOffered !== entry.ticketsRequested && (
                          <span className="text-muted-foreground text-xs">
                            {' '}(offered {entry.ticketsOffered})
                          </span>
                        )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(entry.createdAt, 'MMM d')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {entry.status === 'offered' && entry.offerExpiresAt && (
                        <div className="text-muted-foreground text-xs mt-1">
                          expires {formatDate(entry.offerExpiresAt, 'MMM d h:mm a')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {entry.status === 'waiting' && (
                          <>
                            <Button
                              size="sm"
                              disabled={isBusy || tiers.length === 0}
                              onClick={() => openOfferDialog(entry)}
                            >
                              <Send className="mr-1 h-3.5 w-3.5" />
                              Send Offer
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isBusy}
                              onClick={() => handleSkip(entry)}
                            >
                              Skip
                            </Button>
                          </>
                        )}
                        {entry.status === 'skipped' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isBusy}
                            onClick={() => handleRestore(entry)}
                          >
                            Restore
                          </Button>
                        )}
                        {(entry.status === 'expired' || entry.status === 'declined') && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isBusy || tiers.length === 0}
                            onClick={() => openOfferDialog(entry)}
                          >
                            Re-offer
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Send Offer Dialog */}
      <Dialog open={offerEntry !== null} onOpenChange={(o) => !o && setOfferEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Offer</DialogTitle>
            <DialogDescription>
              {offerEntry && (
                <>
                  Offer tickets to <strong>{offerEntry.firstName} {offerEntry.lastName}</strong>.
                  They&apos;ll have {offerHoldHours} hours to complete the purchase.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {offerEntry && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="offer-tier">Tier</Label>
                <Select value={offerTierId} onValueChange={setOfferTierId}>
                  <SelectTrigger id="offer-tier">
                    <SelectValue placeholder="Pick a tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} — {formatPrice(t.priceCents)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer-qty">Tickets offered</Label>
                <Input
                  id="offer-qty"
                  type="number"
                  min={1}
                  max={50}
                  value={offerQuantity}
                  onChange={(e) =>
                    setOfferQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))
                  }
                />
                <p className="text-muted-foreground text-xs">
                  Requested {offerEntry.ticketsRequested}.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer-hold">Hold (hours)</Label>
                <Input
                  id="offer-hold"
                  type="number"
                  min={1}
                  max={720}
                  value={offerHoldHours}
                  onChange={(e) =>
                    setOfferHoldHours(Math.max(1, parseInt(e.target.value || '1', 10)))
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOfferEntry(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendOffer}
              disabled={!offerTierId || busyId === offerEntry?.id}
            >
              {busyId === offerEntry?.id ? 'Sending…' : 'Send Offer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Message Dialog */}
      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Message Waitlist</DialogTitle>
            <DialogDescription>
              Available merge tags: <code>{'{{first_name}}'}</code>,{' '}
              <code>{'{{last_name}}'}</code>, <code>{'{{event_name}}'}</code>,{' '}
              <code>{'{{event_date}}'}</code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Recipients</Label>
                <Select
                  value={messageRecipientMode}
                  onValueChange={(v) =>
                    setMessageRecipientMode(v as typeof messageRecipientMode)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All on waitlist</SelectItem>
                    <SelectItem value="waiting">All waiting</SelectItem>
                    <SelectItem value="expired_declined">
                      All expired/declined
                    </SelectItem>
                    <SelectItem value="selected" disabled={selectedIds.size === 0}>
                      Selected ({selectedIds.size})
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select
                  value={messageChannel}
                  onValueChange={(v) => setMessageChannel(v as typeof messageChannel)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS (opted-in only)</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Templates</Label>
              <div className="flex flex-wrap gap-2">
                {MESSAGE_TEMPLATES.map((t, i) => (
                  <Button
                    key={i}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyTemplate(i)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>

            {(messageChannel === 'email' || messageChannel === 'both') && (
              <div className="space-y-2">
                <Label htmlFor="msg-subject">Subject *</Label>
                <Input
                  id="msg-subject"
                  value={messageSubject}
                  onChange={(e) => setMessageSubject(e.target.value)}
                  placeholder="Update from {{event_name}}"
                  maxLength={200}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="msg-body">Message *</Label>
              <Textarea
                id="msg-body"
                rows={8}
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Hi {{first_name}}, ..."
                maxLength={4000}
              />
            </div>

            {firstRecipient && messageBody.trim() && (
              <div className="rounded-md border p-3 text-sm">
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">
                  Preview (using {firstRecipient.firstName} {firstRecipient.lastName})
                </p>
                <pre className="whitespace-pre-wrap font-sans">{previewBody}</pre>
              </div>
            )}

            <p className="text-muted-foreground text-sm">
              Will send to <strong>{messageRecipients.length}</strong> recipient
              {messageRecipients.length === 1 ? '' : 's'}.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setMessageOpen(false)}
              disabled={messageSending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendCustom}
              disabled={
                messageSending ||
                !messageBody.trim() ||
                messageRecipients.length === 0
              }
            >
              {messageSending
                ? 'Sending…'
                : `Send to ${messageRecipients.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
