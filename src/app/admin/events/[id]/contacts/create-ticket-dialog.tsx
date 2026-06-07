'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { formatPrice } from '@/lib/utils';
import { createManualTicket } from '@/app/admin/events/[id]/attendees/actions';
import type { PaymentMethod, TicketTier } from '@/types/database';

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'check', label: 'Check' },
  { value: 'comp', label: 'Comp' },
  { value: 'other', label: 'Other' },
];

export interface CreateTicketPrefill {
  name: string;
  email: string;
  phone: string;
}

export type CreateTicketTier = Pick<
  TicketTier,
  'id' | 'name' | 'price_cents' | 'quantity_total' | 'quantity_sold'
>;

interface CreateTicketDialogProps {
  eventId: string;
  tiers: CreateTicketTier[];
  open: boolean;
  prefill: CreateTicketPrefill | null;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const emptyForm = {
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

export function CreateTicketDialog({
  eventId,
  tiers,
  open,
  prefill,
  onOpenChange,
  onCreated,
}: CreateTicketDialogProps) {
  // The parent passes a fresh `key` (derived from the contact id/email)
  // each time it opens this dialog for a new contact, which remounts
  // the component and re-runs this initializer. Avoids the
  // useEffect-resets-state-on-prop-change pattern.
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    attendee_name: prefill?.name ?? '',
    attendee_email: prefill?.email ?? '',
    attendee_phone: prefill?.phone ?? '',
    deliver_email: !!prefill?.email,
    deliver_sms: !!prefill?.phone,
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTier = tiers.find((t) => t.id === form.tier_id);
  const compIsActive = form.payment_method === 'comp';

  function handleTierChange(tierId: string) {
    const t = tiers.find((tier) => tier.id === tierId);
    if (!t) {
      setForm({ ...form, tier_id: tierId });
      return;
    }
    const newDollars = compIsActive
      ? '0.00'
      : ((t.price_cents * form.quantity) / 100).toFixed(2);
    setForm({ ...form, tier_id: tierId, amount_dollars: newDollars });
  }

  function handleQuantityChange(next: number) {
    const q = Math.max(1, next);
    let newDollars = form.amount_dollars;
    if (selectedTier && !compIsActive) {
      newDollars = ((selectedTier.price_cents * q) / 100).toFixed(2);
    }
    setForm({ ...form, quantity: q, amount_dollars: newDollars });
  }

  function toggleComp(on: boolean) {
    if (on) {
      setForm({ ...form, payment_method: 'comp', amount_dollars: '0.00' });
    } else {
      const refilled = selectedTier
        ? ((selectedTier.price_cents * form.quantity) / 100).toFixed(2)
        : '';
      setForm({ ...form, payment_method: 'cash', amount_dollars: refilled });
    }
  }

  async function handleSave() {
    setError(null);
    setPending(true);

    const dollars = parseFloat(form.amount_dollars);
    if (Number.isNaN(dollars) || dollars < 0) {
      setError('Enter a valid amount paid.');
      setPending(false);
      return;
    }
    const amount_paid_cents = Math.round(dollars * 100);

    const result = await createManualTicket(eventId, {
      tier_id: form.tier_id,
      attendee_name: form.attendee_name,
      attendee_email: form.attendee_email || null,
      attendee_phone: form.attendee_phone || null,
      quantity: form.quantity,
      amount_paid_cents,
      payment_method: form.payment_method,
      payment_note: form.payment_note.trim() || null,
      deliver_email: form.deliver_email,
      deliver_sms: form.deliver_sms,
    });

    setPending(false);

    if (!result.success) {
      setError(result.error ?? 'Something went wrong.');
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
    onOpenChange(false);
    onCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Ticket</DialogTitle>
          <DialogDescription>
            Record a manual sale or comp for this contact. The ticket can be
            delivered by email and/or SMS in the same submit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="createticket-tier">Tier *</Label>
            <Select value={form.tier_id} onValueChange={handleTierChange}>
              <SelectTrigger id="createticket-tier" className="w-full">
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
              <Label htmlFor="createticket-name">Name *</Label>
              <Input
                id="createticket-name"
                value={form.attendee_name}
                onChange={(e) =>
                  setForm({ ...form, attendee_name: e.target.value })
                }
                placeholder="Jane Smith"
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="createticket-quantity">Quantity</Label>
              <Input
                id="createticket-quantity"
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="createticket-email">Email</Label>
              <Input
                id="createticket-email"
                type="email"
                value={form.attendee_email}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm((f) => ({
                    ...f,
                    attendee_email: next,
                    deliver_email: next && !f.attendee_email ? true : f.deliver_email,
                  }));
                }}
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="createticket-phone">Phone</Label>
              <Input
                id="createticket-phone"
                type="tel"
                value={form.attendee_phone}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm((f) => ({
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
              <Label htmlFor="createticket-comp" className="cursor-pointer">
                Comp this ticket
              </Label>
              <Switch
                id="createticket-comp"
                checked={compIsActive}
                onCheckedChange={toggleComp}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="createticket-amount" className="text-xs">Amount paid ($)</Label>
                <Input
                  id="createticket-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.amount_dollars}
                  onChange={(e) =>
                    setForm({ ...form, amount_dollars: e.target.value })
                  }
                  disabled={compIsActive}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="createticket-method" className="text-xs">Payment method</Label>
                <Select
                  value={form.payment_method}
                  onValueChange={(val) =>
                    setForm({ ...form, payment_method: val as PaymentMethod })
                  }
                >
                  <SelectTrigger id="createticket-method" className="w-full">
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
              <Label htmlFor="createticket-note" className="text-xs">Payment note (optional)</Label>
              <Input
                id="createticket-note"
                value={form.payment_note}
                onChange={(e) =>
                  setForm({ ...form, payment_note: e.target.value })
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
                  checked={form.deliver_email}
                  disabled={!form.attendee_email}
                  onChange={(e) =>
                    setForm({ ...form, deliver_email: e.target.checked })
                  }
                />
                Email
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-stone-300"
                  checked={form.deliver_sms}
                  disabled={!form.attendee_phone}
                  onChange={(e) =>
                    setForm({ ...form, deliver_sms: e.target.checked })
                  }
                />
                SMS
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave both off to record the ticket silently — you can send it
              later from the attendee&rsquo;s row.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              pending ||
              !form.tier_id ||
              !form.attendee_name.trim() ||
              (!form.attendee_email && !form.attendee_phone)
            }
          >
            {pending ? 'Creating…' : 'Create Ticket'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
