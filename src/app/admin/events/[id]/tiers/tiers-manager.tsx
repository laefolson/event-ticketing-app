'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { createTier, updateTier, deleteTier } from './actions';
import type { TierInput } from './actions';
import type { TicketTier } from '@/types/database';

interface TiersManagerProps {
  tiers: TicketTier[];
  eventId: string;
  eventCapacity: number | null;
}

const emptyForm = {
  name: '',
  description: '',
  price_dollars: '',
  quantity_total: '',
  max_per_contact: '',
  sort_order: '0',
};

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function TiersManager({ tiers, eventId, eventCapacity }: TiersManagerProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<TicketTier | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const totalQuantity = tiers.reduce((sum, t) => sum + t.quantity_total, 0);
  const overCapacity = eventCapacity !== null && totalQuantity > eventCapacity;

  function openCreate() {
    setEditingTier(null);
    setForm({
      ...emptyForm,
      sort_order: String(tiers.length),
    });
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(tier: TicketTier) {
    setEditingTier(tier);
    setForm({
      name: tier.name,
      description: tier.description ?? '',
      price_dollars: (tier.price_cents / 100).toFixed(2),
      quantity_total: String(tier.quantity_total),
      max_per_contact: tier.max_per_contact !== null ? String(tier.max_per_contact) : '',
      sort_order: String(tier.sort_order),
    });
    setError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setError(null);
    setIsPending(true);

    const priceDollars = parseFloat(form.price_dollars || '0');
    if (isNaN(priceDollars) || priceDollars < 0) {
      setError('Price must be a valid number >= 0.');
      setIsPending(false);
      return;
    }

    const quantityTotal = parseInt(form.quantity_total, 10) || 0;

    // Client-side capacity check
    if (eventCapacity !== null) {
      const otherTiersTotal = tiers
        .filter((t) => t.id !== editingTier?.id)
        .reduce((sum, t) => sum + t.quantity_total, 0);
      const newTotal = otherTiersTotal + quantityTotal;

      if (newTotal > eventCapacity) {
        const available = eventCapacity - otherTiersTotal;
        setError(
          `Total tier quantity (${newTotal}) would exceed event capacity (${eventCapacity}). You have ${available} tickets available for this tier.`
        );
        setIsPending(false);
        return;
      }
    }

    const input: TierInput = {
      name: form.name,
      description: form.description || null,
      price_cents: Math.round(priceDollars * 100),
      quantity_total: quantityTotal,
      max_per_contact: form.max_per_contact ? parseInt(form.max_per_contact, 10) : null,
      sort_order: parseInt(form.sort_order, 10) || 0,
    };

    const result = editingTier
      ? await updateTier(editingTier.id, input)
      : await createTier(eventId, input);

    setIsPending(false);

    if (!result.success) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }

    setDialogOpen(false);
    router.refresh();
  }

  async function handleDelete(tierId: string) {
    setIsPending(true);
    const result = await deleteTier(tierId);
    setIsPending(false);

    if (!result.success) {
      setError(result.error ?? 'Failed to delete tier.');
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Ticket Tiers</h2>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Tier
        </Button>
      </div>

      {overCapacity && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Total tier quantity ({totalQuantity}) exceeds event capacity ({eventCapacity}).
          </span>
        </div>
      )}

      {error && !dialogOpen && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {tiers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No ticket tiers yet. Add a tier to start selling tickets.
            </p>
            <Button variant="outline" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Tier
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tiers.map((tier) => (
            <Card key={tier.id}>
              <CardContent className="flex items-start justify-between gap-4 pt-6">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-baseline gap-3">
                    <span className="font-semibold">{tier.name}</span>
                    <span className="text-muted-foreground text-sm font-medium">
                      {formatPrice(tier.price_cents)}
                    </span>
                  </div>
                  {tier.description && (
                    <p className="text-muted-foreground text-sm">{tier.description}</p>
                  )}
                  <p className="text-muted-foreground text-sm">
                    {tier.quantity_sold} / {tier.quantity_total} sold
                    {tier.max_per_contact !== null && (
                      <> &middot; Max {tier.max_per_contact} per person</>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(tier)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={tier.quantity_sold > 0 || isPending}
                    onClick={() => handleDelete(tier.id)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTier ? 'Edit Tier' : 'Add Tier'}</DialogTitle>
            <DialogDescription>
              {editingTier
                ? 'Update the details for this ticket tier.'
                : 'Create a new ticket tier for this event.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && dialogOpen && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="tier-name">Name *</Label>
              <Input
                id="tier-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. General Admission"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tier-price">Price ($)</Label>
              <Input
                id="tier-price"
                type="number"
                min="0"
                step="0.01"
                value={form.price_dollars}
                onChange={(e) => setForm({ ...form, price_dollars: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tier-quantity">Quantity *</Label>
              <Input
                id="tier-quantity"
                type="number"
                min="1"
                step="1"
                value={form.quantity_total}
                onChange={(e) => setForm({ ...form, quantity_total: e.target.value })}
                placeholder="e.g. 50"
              />
              {eventCapacity !== null && (() => {
                const otherTiersTotal = tiers
                  .filter((t) => t.id !== editingTier?.id)
                  .reduce((sum, t) => sum + t.quantity_total, 0);
                const available = eventCapacity - otherTiersTotal;
                return (
                  <p className="text-muted-foreground text-xs">
                    {otherTiersTotal} of {eventCapacity} capacity allocated across other tiers. Max for this tier: {available}.
                  </p>
                );
              })()}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tier-max">Max per person</Label>
              <Input
                id="tier-max"
                type="number"
                min="1"
                step="1"
                value={form.max_per_contact}
                onChange={(e) => setForm({ ...form, max_per_contact: e.target.value })}
                placeholder="No limit"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tier-description">Description</Label>
              <Textarea
                id="tier-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                maxLength={1000}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tier-sort">Sort order</Label>
              <Input
                id="tier-sort"
                type="number"
                min="0"
                step="1"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
