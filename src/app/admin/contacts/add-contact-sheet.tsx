'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet, SheetTrigger, SheetContent, SheetHeader, SheetFooter,
  SheetTitle, SheetDescription, SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { createMasterContact } from './actions';

const EMPTY = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  sms_opt_in_event_updates: false,
  sms_opt_in_marketing: false,
  email_opt_out: false,
  notes: '',
};

export function AddContactSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(EMPTY);

  function reset() {
    setForm(EMPTY);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createMasterContact(form);
      if (res.success) {
        toast.success('Contact added');
        reset();
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Failed to add contact');
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <SheetTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Contact
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Add contact</SheetTitle>
          <SheetDescription>
            Add a new person to the master contact list. They can be linked to events later.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 space-y-4">
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
                placeholder="+1 555 123 4567"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
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
                placeholder="Internal admin notes (optional)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <SheetFooter className="border-t">
            <SheetClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>Cancel</Button>
            </SheetClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Adding…' : 'Add contact'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
