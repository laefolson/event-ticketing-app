'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  FileSpreadsheet,
  CheckCircle2,
  Send,
  Mail,
  MessageSquare,
  Repeat2,
  CalendarHeart,
  Ticket,
  Bell,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
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
import {
  createContact,
  updateContact,
  deleteContact,
  sendInvitations,
  sendSaveTheDates,
  bulkUpdateContactChannel,
  sendTicketReminders,
} from './actions';
import type {
  ContactInput,
  InvitationScope,
  InvitationResult,
  SaveTheDateScope,
  SaveTheDateResult,
  TicketReminderScope,
  TicketReminderResult,
} from './actions';
import type { ContactWithMaster, CsvImport, InvitationChannel } from '@/types/database';
import { formatDate } from '@/lib/utils';
import { AddFromMasterSheet } from './add-from-master-sheet';
import {
  CreateTicketDialog,
  type CreateTicketPrefill,
  type CreateTicketTier,
} from './create-ticket-dialog';

interface ContactsManagerProps {
  contacts: ContactWithMaster[];
  csvImports: CsvImport[];
  eventId: string;
  tiers: CreateTicketTier[];
  priorEvents: { id: string; title: string }[];
  pastContributors: string[];
}

const emptyForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  invitation_channel: 'email' as InvitationChannel,
};

function channelLabel(channel: InvitationChannel): string {
  switch (channel) {
    case 'email':
      return 'Email';
    case 'sms':
      return 'SMS';
    case 'both':
      return 'Both';
    case 'none':
      return 'None';
  }
}

function channelVariant(
  channel: InvitationChannel
): 'default' | 'secondary' | 'outline' {
  switch (channel) {
    case 'email':
      return 'default';
    case 'sms':
      return 'secondary';
    case 'both':
      return 'default';
    case 'none':
      return 'outline';
  }
}

export function ContactsManager({
  contacts,
  csvImports,
  eventId,
  tiers,
  priorEvents,
  pastContributors,
}: ContactsManagerProps) {
  const router = useRouter();

  // Contact dialog state
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactWithMaster | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invitation dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteScope, setInviteScope] = useState<InvitationScope>('uninvited');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<InvitationResult | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  // Ticket Reminder dialog state — custom subject + body, optional
  // per-send channel selection, and a scope filter (default
  // "Invited, no ticket yet" per the design call).
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [reminderScope, setReminderScope] = useState<TicketReminderScope>('no_ticket');
  const [reminderSubject, setReminderSubject] = useState('');
  const [reminderBody, setReminderBody] = useState('');
  const [reminderChannelEmail, setReminderChannelEmail] = useState(true);
  const [reminderChannelSms, setReminderChannelSms] = useState(true);
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderResult, setReminderResult] = useState<TicketReminderResult | null>(null);

  // Save the Date dialog state
  const [stdDialogOpen, setStdDialogOpen] = useState(false);
  const [stdScope, setStdScope] = useState<SaveTheDateScope>('uninvited');
  const [stdSending, setStdSending] = useState(false);
  const [stdResult, setStdResult] = useState<SaveTheDateResult | null>(null);

  // Create Ticket dialog state — prefilled with the clicked contact's
  // name/email/phone so admins can comp a ticket or record a Venmo/cash
  // sale without retyping. Opens via the per-row Ticket icon button.
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [createTicketPrefill, setCreateTicketPrefill] = useState<CreateTicketPrefill | null>(null);

  // Channel reassignment dialog state
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [channelScope, setChannelScope] = useState<'all' | 'selected'>('all');
  const [channelTarget, setChannelTarget] = useState<InvitationChannel>('email');
  const [channelUpdating, setChannelUpdating] = useState(false);
  const [channelResult, setChannelResult] = useState<{ updated: number } | null>(null);

  // Search & filter
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  const filteredContacts = useMemo(() => {
    let result = contacts;

    if (channelFilter !== 'all') {
      result = result.filter((c) => c.invitation_channel === channelFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const m = c.master_contacts;
        return (
          m.first_name.toLowerCase().includes(q) ||
          m.last_name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (m.phone !== null && m.phone.includes(q))
        );
      });
    }

    return result;
  }, [contacts, search, channelFilter]);

  // Contact dialog handlers
  function openCreate() {
    setEditingContact(null);
    setForm(emptyForm);
    setError(null);
    setContactDialogOpen(true);
  }

  function openEdit(contact: ContactWithMaster) {
    setEditingContact(contact);
    setForm({
      first_name: contact.master_contacts.first_name,
      last_name: contact.master_contacts.last_name,
      email: contact.master_contacts.email,
      phone: contact.master_contacts.phone ?? '',
      invitation_channel: contact.invitation_channel,
    });
    setError(null);
    setContactDialogOpen(true);
  }

  async function handleSave() {
    setError(null);
    setIsPending(true);

    const input: ContactInput = {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone || null,
      invitation_channel: form.invitation_channel,
    };

    const result = editingContact
      ? await updateContact(editingContact.id, input)
      : await createContact(eventId, input);

    setIsPending(false);

    if (!result.success) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }

    setContactDialogOpen(false);
    router.refresh();
  }

  function openCreateTicket(contact: ContactWithMaster) {
    const m = contact.master_contacts;
    setCreateTicketPrefill({
      name: `${m.first_name} ${m.last_name}`.trim() || m.email,
      email: m.email,
      phone: m.phone ?? '',
    });
    setCreateTicketOpen(true);
  }

  async function handleDelete(contactId: string) {
    setIsPending(true);
    const result = await deleteContact(contactId);
    setIsPending(false);

    if (!result.success) {
      setError(result.error ?? 'Failed to delete contact.');
      return;
    }

    router.refresh();
  }

  // Invitation handlers
  const inviteCounts = useMemo(() => {
    let targetContacts: ContactWithMaster[];
    if (inviteScope === 'all') {
      targetContacts = contacts.filter((c) => c.invitation_channel !== 'none');
    } else if (inviteScope === 'uninvited') {
      targetContacts = contacts.filter((c) => c.invitation_channel !== 'none' && !c.invited_at);
    } else {
      targetContacts = contacts.filter((c) => selectedContactIds.has(c.id) && c.invitation_channel !== 'none');
    }
    const emailCount = targetContacts.filter((c) => (c.invitation_channel === 'email' || c.invitation_channel === 'both') && c.master_contacts.email).length;
    const smsCount = targetContacts.filter((c) => (c.invitation_channel === 'sms' || c.invitation_channel === 'both') && c.master_contacts.phone).length;
    return { total: targetContacts.length, emailCount, smsCount };
  }, [contacts, inviteScope, selectedContactIds]);

  function openInviteDialog() {
    setInviteScope('uninvited');
    setInviteResult(null);
    setInviteDialogOpen(true);
  }

  async function handleSendInvitations() {
    setInviteSending(true);
    const result = await sendInvitations({
      eventId,
      scope: inviteScope,
      contactIds: inviteScope === 'selected' ? Array.from(selectedContactIds) : undefined,
    });
    setInviteSending(false);

    if (result.success && result.data) {
      setInviteResult(result.data);
    } else {
      setInviteResult({ sent: 0, failed: 0, failedDetails: [result.error ?? 'Failed to send invitations'] });
    }
  }

  function closeInviteDialog() {
    setInviteDialogOpen(false);
    if (inviteResult) {
      router.refresh();
    }
  }

  // Ticket Reminder handlers — count preview mirrors the invite dialog
  // but adds a no_ticket filter that walks confirmed/checked-in tickets
  // in this event to subtract anyone who already bought.
  const reminderCounts = useMemo(() => {
    const eligible = contacts.filter((c) => c.invitation_channel !== 'none');
    let target: ContactWithMaster[];
    if (reminderScope === 'selected') {
      target = eligible.filter((c) => selectedContactIds.has(c.id));
    } else {
      target = eligible;
    }
    const emailCount = target.filter(
      (c) =>
        reminderChannelEmail &&
        (c.invitation_channel === 'email' || c.invitation_channel === 'both') &&
        c.master_contacts.email
    ).length;
    // SMS preview honors the master sms_opt_in_event_updates flag —
    // contacts who haven't opted in won't be texted even if their
    // per-event channel allows it.
    const smsCount = target.filter(
      (c) =>
        reminderChannelSms &&
        (c.invitation_channel === 'sms' || c.invitation_channel === 'both') &&
        c.master_contacts.phone &&
        c.master_contacts.sms_opt_in_event_updates
    ).length;
    return { total: target.length, emailCount, smsCount };
  }, [
    contacts,
    reminderScope,
    selectedContactIds,
    reminderChannelEmail,
    reminderChannelSms,
  ]);

  function openReminderDialog() {
    setReminderScope('no_ticket');
    setReminderSubject('');
    setReminderBody('');
    setReminderChannelEmail(true);
    setReminderChannelSms(true);
    setReminderResult(null);
    setReminderDialogOpen(true);
  }

  function closeReminderDialog() {
    setReminderDialogOpen(false);
    if (reminderResult) router.refresh();
  }

  async function handleSendReminders() {
    if (!reminderSubject.trim() || !reminderBody.trim()) {
      toast.error('Subject and message body are required.');
      return;
    }
    if (!reminderChannelEmail && !reminderChannelSms) {
      toast.error('Pick at least one channel.');
      return;
    }
    setReminderSending(true);
    const result = await sendTicketReminders({
      eventId,
      scope: reminderScope,
      contactIds:
        reminderScope === 'selected' ? Array.from(selectedContactIds) : undefined,
      subject: reminderSubject.trim(),
      body: reminderBody.trim(),
      channels: { email: reminderChannelEmail, sms: reminderChannelSms },
    });
    setReminderSending(false);
    if (result.success && result.data) {
      setReminderResult(result.data);
    } else {
      setReminderResult({
        sent: 0,
        failed: 0,
        skipped: 0,
        skippedNoOptIn: 0,
        failedDetails: [result.error ?? 'Failed to send reminders'],
      });
    }
  }

  // Save the Date handlers
  const stdCounts = useMemo(() => {
    let targetContacts: ContactWithMaster[];
    if (stdScope === 'all') {
      targetContacts = contacts.filter((c) => c.invitation_channel !== 'none');
    } else if (stdScope === 'uninvited') {
      targetContacts = contacts.filter((c) => c.invitation_channel !== 'none' && !c.invited_at);
    } else {
      targetContacts = contacts.filter((c) => selectedContactIds.has(c.id) && c.invitation_channel !== 'none');
    }
    const emailCount = targetContacts.filter((c) => (c.invitation_channel === 'email' || c.invitation_channel === 'both') && c.master_contacts.email).length;
    const smsCount = targetContacts.filter((c) => (c.invitation_channel === 'sms' || c.invitation_channel === 'both') && c.master_contacts.phone).length;
    return { total: targetContacts.length, emailCount, smsCount };
  }, [contacts, stdScope, selectedContactIds]);

  function openStdDialog() {
    setStdScope('uninvited');
    setStdResult(null);
    setStdDialogOpen(true);
  }

  async function handleSendSaveTheDates() {
    setStdSending(true);
    const result = await sendSaveTheDates({
      eventId,
      scope: stdScope,
      contactIds: stdScope === 'selected' ? Array.from(selectedContactIds) : undefined,
    });
    setStdSending(false);

    if (result.success && result.data) {
      setStdResult(result.data);
    } else {
      setStdResult({ sent: 0, failed: 0, failedDetails: [result.error ?? 'Failed to send save-the-dates'] });
    }
  }

  function closeStdDialog() {
    setStdDialogOpen(false);
    if (stdResult) {
      router.refresh();
    }
  }

  // Channel reassignment handlers
  const channelPreviewCount = useMemo(() => {
    if (channelScope === 'all') return contacts.length;
    return selectedContactIds.size;
  }, [contacts.length, channelScope, selectedContactIds.size]);

  function openChannelDialog() {
    setChannelScope('all');
    setChannelTarget('email');
    setChannelResult(null);
    setChannelDialogOpen(true);
  }

  async function handleBulkChannelUpdate() {
    setChannelUpdating(true);
    const result = await bulkUpdateContactChannel(
      eventId,
      channelScope,
      channelScope === 'selected' ? Array.from(selectedContactIds) : [],
      channelTarget
    );
    setChannelUpdating(false);

    if (result.success && result.data) {
      setChannelResult(result.data);
    } else {
      setChannelResult({ updated: 0 });
    }
  }

  function closeChannelDialog() {
    setChannelDialogOpen(false);
    if (channelResult) {
      router.refresh();
    }
  }

  function toggleContactSelection(id: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <TooltipProvider>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          Contacts{' '}
          <span className="text-muted-foreground font-normal">
            ({contacts.length})
          </span>
        </h2>
        <div className="flex gap-2">
          {contacts.length > 0 && (
            <>
              <Button variant="outline" onClick={openChannelDialog}>
                <Repeat2 className="mr-2 h-4 w-4" />
                Change Channel
              </Button>
              <Button variant="outline" onClick={openStdDialog}>
                <CalendarHeart className="mr-2 h-4 w-4" />
                Send Save the Date
              </Button>
              <Button variant="outline" onClick={openInviteDialog}>
                <Send className="mr-2 h-4 w-4" />
                Send Invitations
              </Button>
              <Button variant="outline" onClick={openReminderDialog}>
                <Bell className="mr-2 h-4 w-4" />
                Send Reminder
              </Button>
            </>
          )}
          <AddFromMasterSheet eventId={eventId} priorEvents={priorEvents} pastContributors={pastContributors} />
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Error banner (outside dialogs) */}
      {error && !contactDialogOpen && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {contacts.length === 0 ? (
        /* Empty state */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No contacts yet. Pick from your master list or add one manually.
            </p>
            <div className="flex gap-2">
              <AddFromMasterSheet eventId={eventId} priorEvents={priorEvents} pastContributors={pastContributors} />
              <Button variant="outline" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Add Contact
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Search & Filter bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="both">Both</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Contacts table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="rounded border-stone-300"
                      checked={filteredContacts.length > 0 && filteredContacts.every((c) => selectedContactIds.has(c.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedContactIds(new Set(filteredContacts.map((c) => c.id)));
                        } else {
                          setSelectedContactIds(new Set());
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground h-24 text-center"
                    >
                      No contacts match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="rounded border-stone-300"
                          checked={selectedContactIds.has(contact.id)}
                          onChange={() => toggleContactSelection(contact.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {contact.master_contacts.first_name} {contact.master_contacts.last_name}
                      </TableCell>
                      <TableCell>{contact.master_contacts.email}</TableCell>
                      <TableCell>{contact.master_contacts.phone ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={channelVariant(contact.invitation_channel)}>
                          {channelLabel(contact.invitation_channel)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {contact.invited_at ? (
                          <span className="text-muted-foreground text-xs">
                            {formatDate(contact.invited_at, 'MMM d, h:mm a')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openCreateTicket(contact)}
                                aria-label="Create ticket for this contact"
                              >
                                <Ticket className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Create ticket</TooltipContent>
                          </Tooltip>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(contact)}
                            aria-label="Edit contact"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleDelete(contact.id)}
                            aria-label="Remove contact from event"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Import history */}
      {csvImports.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Import History
          </h3>
          <div className="space-y-2">
            {csvImports.map((imp) => (
              <div
                key={imp.id}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{imp.filename}</span>
                  <span className="text-muted-foreground ml-2">
                    {imp.imported_count} imported, {imp.skipped_count} skipped
                    (of {imp.row_count})
                  </span>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatDate(imp.imported_at, 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Contact Dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingContact ? 'Edit Contact' : 'Add Contact'}
            </DialogTitle>
            <DialogDescription>
              {editingContact
                ? 'Update the details for this contact.'
                : 'Add a new contact to this event.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && contactDialogOpen && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact-first-name">First name *</Label>
                <Input
                  id="contact-first-name"
                  value={form.first_name}
                  onChange={(e) =>
                    setForm({ ...form, first_name: e.target.value })
                  }
                  placeholder="Jane"
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-last-name">Last name *</Label>
                <Input
                  id="contact-last-name"
                  value={form.last_name}
                  onChange={(e) =>
                    setForm({ ...form, last_name: e.target.value })
                  }
                  placeholder="Smith"
                  maxLength={200}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 555-123-4567"
                maxLength={30}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-channel">Invitation channel</Label>
              <Select
                value={form.invitation_channel}
                onValueChange={(val) =>
                  setForm({
                    ...form,
                    invitation_channel: val as InvitationChannel,
                  })
                }
              >
                <SelectTrigger id="contact-channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-muted-foreground text-xs">
              * At least one of email or phone is required.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setContactDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Invitations Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={(open) => {
        if (!open) closeInviteDialog();
        else setInviteDialogOpen(true);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {inviteResult ? 'Invitations Sent' : 'Send Invitations'}
            </DialogTitle>
            <DialogDescription>
              {inviteResult
                ? 'Here are the results of your invitation send.'
                : 'Choose which contacts to send invitations to.'}
            </DialogDescription>
          </DialogHeader>

          {inviteResult ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-green-800 dark:text-green-200">
                    {inviteResult.sent} message{inviteResult.sent !== 1 ? 's' : ''} sent
                  </p>
                  {inviteResult.failed > 0 && (
                    <p className="text-red-700 dark:text-red-300">
                      {inviteResult.failed} failed
                    </p>
                  )}
                </div>
              </div>

              {inviteResult.failedDetails.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Failures:</p>
                  <div className="max-h-40 overflow-y-auto rounded-md border p-3 text-xs">
                    {inviteResult.failedDetails.map((d, i) => (
                      <div key={i} className="text-muted-foreground py-0.5">
                        {d}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button onClick={closeInviteDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Who to invite</Label>
                <Select value={inviteScope} onValueChange={(val) => setInviteScope(val as InvitationScope)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All contacts</SelectItem>
                    <SelectItem value="uninvited">Un-invited only</SelectItem>
                    <SelectItem value="selected">Selected contacts ({selectedContactIds.size})</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border p-4 space-y-2">
                <p className="text-sm font-medium">Summary</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {inviteCounts.emailCount} email{inviteCounts.emailCount !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {inviteCounts.smsCount} SMS
                  </span>
                </div>
                {inviteCounts.total === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    No contacts match this scope.
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeInviteDialog} disabled={inviteSending}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSendInvitations}
                  disabled={inviteSending || inviteCounts.total === 0}
                >
                  {inviteSending ? 'Sending...' : `Send ${inviteCounts.emailCount + inviteCounts.smsCount} Invitations`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send Save the Date Dialog */}
      <Dialog open={stdDialogOpen} onOpenChange={(open) => {
        if (!open) closeStdDialog();
        else setStdDialogOpen(true);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {stdResult ? 'Save the Dates Sent' : 'Send Save the Date'}
            </DialogTitle>
            <DialogDescription>
              {stdResult
                ? 'Here are the results of your save-the-date send.'
                : 'Choose which contacts to send save-the-date messages to.'}
            </DialogDescription>
          </DialogHeader>

          {stdResult ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-green-800 dark:text-green-200">
                    {stdResult.sent} message{stdResult.sent !== 1 ? 's' : ''} sent
                  </p>
                  {stdResult.failed > 0 && (
                    <p className="text-red-700 dark:text-red-300">
                      {stdResult.failed} failed
                    </p>
                  )}
                </div>
              </div>

              {stdResult.failedDetails.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Failures:</p>
                  <div className="max-h-40 overflow-y-auto rounded-md border p-3 text-xs">
                    {stdResult.failedDetails.map((d, i) => (
                      <div key={i} className="text-muted-foreground py-0.5">
                        {d}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button onClick={closeStdDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Who to send to</Label>
                <Select value={stdScope} onValueChange={(val) => setStdScope(val as SaveTheDateScope)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All contacts</SelectItem>
                    <SelectItem value="uninvited">Un-invited only</SelectItem>
                    <SelectItem value="selected">Selected contacts ({selectedContactIds.size})</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border p-4 space-y-2">
                <p className="text-sm font-medium">Summary</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {stdCounts.emailCount} email{stdCounts.emailCount !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {stdCounts.smsCount} SMS
                  </span>
                </div>
                {stdCounts.total === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    No contacts match this scope.
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeStdDialog} disabled={stdSending}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSendSaveTheDates}
                  disabled={stdSending || stdCounts.total === 0}
                >
                  {stdSending ? 'Sending...' : `Send ${stdCounts.emailCount + stdCounts.smsCount} Messages`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Channel Dialog */}
      <Dialog open={channelDialogOpen} onOpenChange={(open) => {
        if (!open) closeChannelDialog();
        else setChannelDialogOpen(true);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {channelResult ? 'Channel Updated' : 'Change Invitation Channel'}
            </DialogTitle>
            <DialogDescription>
              {channelResult
                ? 'The invitation channel has been updated.'
                : 'Update the invitation channel for contacts.'}
            </DialogDescription>
          </DialogHeader>

          {channelResult ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  {channelResult.updated} contact{channelResult.updated !== 1 ? 's' : ''} updated
                </p>
              </div>
              <DialogFooter>
                <Button onClick={closeChannelDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={channelScope} onValueChange={(val) => setChannelScope(val as 'all' | 'selected')}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All contacts</SelectItem>
                    <SelectItem value="selected">Selected contacts ({selectedContactIds.size})</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>New channel</Label>
                <Select value={channelTarget} onValueChange={(val) => setChannelTarget(val as InvitationChannel)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-sm text-muted-foreground">
                This will update {channelPreviewCount} contact{channelPreviewCount !== 1 ? 's' : ''}.
              </p>

              {channelScope === 'selected' && selectedContactIds.size === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No contacts selected. Select contacts from the table first.
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeChannelDialog} disabled={channelUpdating}>
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkChannelUpdate}
                  disabled={channelUpdating || channelPreviewCount === 0}
                >
                  {channelUpdating ? 'Updating...' : 'Update Channel'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send Reminder Dialog */}
      <Dialog
        open={reminderDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeReminderDialog();
          else setReminderDialogOpen(true);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {reminderResult ? 'Reminders Sent' : 'Send Reminder'}
            </DialogTitle>
            <DialogDescription>
              {reminderResult
                ? 'Here are the results of your reminder send.'
                : 'Write a custom subject and message. The invitation image is attached automatically.'}
            </DialogDescription>
          </DialogHeader>

          {reminderResult ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-green-800 dark:text-green-200">
                    {reminderResult.sent} message{reminderResult.sent !== 1 ? 's' : ''} sent
                  </p>
                  {reminderResult.skipped > 0 && (
                    <p className="text-muted-foreground">
                      {reminderResult.skipped} skipped (already has a ticket, or channel mismatch)
                    </p>
                  )}
                  {reminderResult.skippedNoOptIn > 0 && (
                    <p className="text-muted-foreground">
                      {reminderResult.skippedNoOptIn} SMS skipped — recipient hasn&rsquo;t opted in to event updates
                    </p>
                  )}
                  {reminderResult.failed > 0 && (
                    <p className="text-red-700 dark:text-red-300">
                      {reminderResult.failed} failed
                    </p>
                  )}
                </div>
              </div>
              {reminderResult.failedDetails.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Failures:</p>
                  <div className="max-h-40 overflow-y-auto rounded-md border p-3 text-xs">
                    {reminderResult.failedDetails.map((d, i) => (
                      <div key={i} className="text-muted-foreground py-0.5">
                        {d}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button onClick={closeReminderDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reminder-subject">Subject *</Label>
                <Input
                  id="reminder-subject"
                  value={reminderSubject}
                  onChange={(e) => setReminderSubject(e.target.value)}
                  placeholder="Don't forget to grab your tickets!"
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reminder-body">Message *</Label>
                <Textarea
                  id="reminder-body"
                  rows={6}
                  value={reminderBody}
                  onChange={(e) => setReminderBody(e.target.value)}
                  placeholder="Hi! Tickets for the dinner are going fast — grab yours before they're gone."
                  maxLength={4000}
                />
                <p className="text-xs text-muted-foreground">
                  The message becomes the body of the email and the SMS. The
                  invitation image is attached automatically.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Who to remind</Label>
                <Select
                  value={reminderScope}
                  onValueChange={(val) => setReminderScope(val as TicketReminderScope)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_ticket">Invited, no ticket yet</SelectItem>
                    <SelectItem value="all">All contacts</SelectItem>
                    <SelectItem value="selected">
                      Selected contacts ({selectedContactIds.size})
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-medium">Channels</p>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={reminderChannelEmail}
                      onCheckedChange={(v) => setReminderChannelEmail(v === true)}
                    />
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={reminderChannelSms}
                      onCheckedChange={(v) => setReminderChannelSms(v === true)}
                    />
                    <MessageSquare className="h-3.5 w-3.5" />
                    SMS
                  </label>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground pt-1">
                  <span>
                    Up to {reminderCounts.emailCount} email{reminderCounts.emailCount !== 1 ? 's' : ''}
                  </span>
                  <span>
                    Up to {reminderCounts.smsCount} SMS
                  </span>
                </div>
                {reminderScope === 'no_ticket' && (
                  <p className="text-xs text-muted-foreground">
                    Contacts who already have a confirmed ticket are excluded automatically.
                  </p>
                )}
                {reminderChannelSms && (
                  <p className="text-xs text-muted-foreground">
                    SMS goes only to contacts who&rsquo;ve opted in to event-update texts.
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeReminderDialog} disabled={reminderSending}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSendReminders}
                  disabled={
                    reminderSending ||
                    !reminderSubject.trim() ||
                    !reminderBody.trim() ||
                    (!reminderChannelEmail && !reminderChannelSms)
                  }
                >
                  {reminderSending ? 'Sending…' : 'Send'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CreateTicketDialog
        key={createTicketPrefill?.email ?? 'closed'}
        eventId={eventId}
        tiers={tiers}
        open={createTicketOpen}
        prefill={createTicketPrefill}
        onOpenChange={setCreateTicketOpen}
        onCreated={() => router.refresh()}
      />
    </div>
    </TooltipProvider>
  );
}
