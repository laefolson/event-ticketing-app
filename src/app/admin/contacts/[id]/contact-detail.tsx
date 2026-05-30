'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger, DialogClose,
} from '@/components/ui/dialog';
import { updateMasterContact, deleteMasterContact } from '../actions';
import type { MasterContact } from '@/types/database';

const SOURCE_LABEL: Record<MasterContact['source'], string> = {
  manual: 'Manual',
  csv_import: 'CSV import',
  google_sheets: 'Google Sheets',
  checkout: 'Checkout',
  rsvp: 'RSVP',
};

export function ContactDetail({ contact }: { contact: MasterContact }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [form, setForm] = useState({
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email,
    phone: contact.phone ?? '',
    sms_opt_in_event_updates: contact.sms_opt_in_event_updates,
    sms_opt_in_marketing: contact.sms_opt_in_marketing,
    email_opt_out: contact.email_opt_out,
    notes: contact.notes ?? '',
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateMasterContact(contact.id, form);
      if (res.success) {
        toast.success('Contact updated');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Failed to update contact');
      }
    });
  }

  function handleDelete() {
    startDelete(async () => {
      const res = await deleteMasterContact(contact.id);
      if (res.success) {
        toast.success('Contact deleted');
        router.push('/admin/contacts');
      } else {
        toast.error(res.error ?? 'Failed to delete contact');
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Contact info</CardTitle>
        <span className="text-xs text-muted-foreground">
          Source: {SOURCE_LABEL[contact.source]}
        </span>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                required
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="opt_event" className="flex-1 cursor-pointer">
                SMS event updates opt-in
              </Label>
              <Switch
                id="opt_event"
                checked={form.sms_opt_in_event_updates}
                onCheckedChange={(v) => setForm({ ...form, sms_opt_in_event_updates: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="opt_marketing" className="flex-1 cursor-pointer">
                SMS marketing opt-in
              </Label>
              <Switch
                id="opt_marketing"
                checked={form.sms_opt_in_marketing}
                onCheckedChange={(v) => setForm({ ...form, sms_opt_in_marketing: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="email_opt_out" className="flex-1 cursor-pointer">
                Email opt-out
              </Label>
              <Switch
                id="email_opt_out"
                checked={form.email_opt_out}
                onCheckedChange={(v) => setForm({ ...form, email_opt_out: v })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="ghost" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this contact?</DialogTitle>
                  <DialogDescription>
                    The contact will be removed from the master list. Any per-event records
                    linked to them will also be removed. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="ghost" disabled={deleting}>Cancel</Button>
                  </DialogClose>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : 'Delete contact'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
