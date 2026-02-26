'use client';

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import {
  Plus,
  Upload,
  Pencil,
  Trash2,
  Search,
  FileSpreadsheet,
  CheckCircle2,
  Send,
  Mail,
  MessageSquare,
} from 'lucide-react';
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
import {
  createContact,
  updateContact,
  deleteContact,
  importContacts,
  sendInvitations,
} from './actions';
import type { ContactInput, CsvRow, ImportResult, InvitationScope, InvitationResult } from './actions';
import type { Contact, CsvImport, InvitationChannel } from '@/types/database';
import { format } from 'date-fns';

interface ContactsManagerProps {
  contacts: Contact[];
  csvImports: CsvImport[];
  eventId: string;
}

const emptyForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  invitation_channel: 'email' as InvitationChannel,
};

const HEADER_ALIASES: Record<string, string> = {
  fname: 'first_name',
  firstname: 'first_name',
  'first name': 'first_name',
  first: 'first_name',
  lname: 'last_name',
  lastname: 'last_name',
  'last name': 'last_name',
  last: 'last_name',
  email_address: 'email',
  emailaddress: 'email',
  'e-mail': 'email',
  mobile: 'phone',
  phone_number: 'phone',
  phonenumber: 'phone',
  telephone: 'phone',
  tel: 'phone',
  cell: 'phone',
  channel: 'invitation_channel',
  invite_channel: 'invitation_channel',
};

function normalizeHeader(header: string): string {
  const cleaned = header.trim().toLowerCase().replace(/[_\s-]+/g, '_');
  // Direct match
  if (['first_name', 'last_name', 'email', 'phone', 'invitation_channel'].includes(cleaned)) {
    return cleaned;
  }
  // Alias match (try both with underscores and without)
  const withoutUnderscores = cleaned.replace(/_/g, '');
  return HEADER_ALIASES[cleaned] ?? HEADER_ALIASES[withoutUnderscores] ?? cleaned;
}

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
}: ContactsManagerProps) {
  const router = useRouter();

  // Contact dialog state
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CSV dialog state
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParsing, setCsvParsing] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Invitation dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteScope, setInviteScope] = useState<InvitationScope>('uninvited');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<InvitationResult | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

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
      result = result.filter(
        (c) =>
          (c.first_name && c.first_name.toLowerCase().includes(q)) ||
          (c.last_name && c.last_name.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q))
      );
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

  function openEdit(contact: Contact) {
    setEditingContact(contact);
    setForm({
      first_name: contact.first_name ?? '',
      last_name: contact.last_name ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
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
      email: form.email || null,
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

  // CSV dialog handlers
  function openCsvDialog() {
    setCsvFile(null);
    setCsvError(null);
    setCsvParsing(false);
    setImportResult(null);
    setCsvDialogOpen(true);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setCsvError(null);
    setImportResult(null);

    if (file && file.size > 5 * 1024 * 1024) {
      setCsvFile(null);
      setCsvError('CSV file must be under 5 MB.');
      e.target.value = '';
      return;
    }

    setCsvFile(file);
  }

  async function handleImport() {
    if (!csvFile) return;

    setCsvParsing(true);
    setCsvError(null);

    try {
      const text = await csvFile.text();

      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
      });

      if (parsed.errors.length > 0 && parsed.data.length === 0) {
        setCsvError('Failed to parse CSV file. Please check the format.');
        setCsvParsing(false);
        return;
      }

      // Validate required headers
      const headers = parsed.meta.fields ?? [];
      const hasFirstName = headers.includes('first_name');
      const hasLastName = headers.includes('last_name');
      const hasEmail = headers.includes('email');
      const hasPhone = headers.includes('phone');

      if (!hasFirstName || !hasLastName) {
        setCsvError(
          'CSV must include "first_name" and "last_name" columns (or recognized aliases like "fname", "lname").'
        );
        setCsvParsing(false);
        return;
      }

      if (!hasEmail && !hasPhone) {
        setCsvError(
          'CSV must include at least one of "email" or "phone" columns.'
        );
        setCsvParsing(false);
        return;
      }

      const rows: CsvRow[] = parsed.data.map((row) => ({
        first_name: row.first_name?.trim() ?? '',
        last_name: row.last_name?.trim() ?? '',
        email: row.email?.trim() || null,
        phone: row.phone?.trim() || null,
        invitation_channel:
          (row.invitation_channel?.trim() as InvitationChannel) || null,
      }));

      const result = await importContacts(eventId, rows, csvFile.name);

      if (!result.success) {
        setCsvError(result.error ?? 'Import failed.');
        setCsvParsing(false);
        return;
      }

      setImportResult(result.data!);
      setCsvParsing(false);
    } catch {
      setCsvError('An error occurred while processing the file.');
      setCsvParsing(false);
    }
  }

  function closeCsvDialog() {
    setCsvDialogOpen(false);
    if (importResult) {
      router.refresh();
    }
  }

  // Invitation handlers
  const inviteCounts = useMemo(() => {
    let targetContacts: Contact[];
    if (inviteScope === 'all') {
      targetContacts = contacts.filter((c) => c.invitation_channel !== 'none');
    } else if (inviteScope === 'uninvited') {
      targetContacts = contacts.filter((c) => c.invitation_channel !== 'none' && !c.invited_at);
    } else {
      targetContacts = contacts.filter((c) => selectedContactIds.has(c.id) && c.invitation_channel !== 'none');
    }
    const emailCount = targetContacts.filter((c) => (c.invitation_channel === 'email' || c.invitation_channel === 'both') && c.email).length;
    const smsCount = targetContacts.filter((c) => (c.invitation_channel === 'sms' || c.invitation_channel === 'both') && c.phone).length;
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

  function toggleContactSelection(id: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
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
            <Button variant="outline" onClick={openInviteDialog}>
              <Send className="mr-2 h-4 w-4" />
              Send Invitations
            </Button>
          )}
          <Button variant="outline" onClick={openCsvDialog}>
            <Upload className="mr-2 h-4 w-4" />
            Upload CSV
          </Button>
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
              No contacts yet. Add contacts manually or upload a CSV file.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={openCsvDialog}>
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV
              </Button>
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
                        {contact.first_name} {contact.last_name}
                      </TableCell>
                      <TableCell>{contact.email ?? '—'}</TableCell>
                      <TableCell>{contact.phone ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={channelVariant(contact.invitation_channel)}>
                          {channelLabel(contact.invitation_channel)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {contact.invited_at ? (
                          <span className="text-muted-foreground text-xs">
                            {format(new Date(contact.invited_at), 'MMM d, h:mm a')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(contact)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleDelete(contact.id)}
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
                  {format(new Date(imp.imported_at), 'MMM d, yyyy h:mm a')}
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

      {/* CSV Upload Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={(open) => {
        if (!open) closeCsvDialog();
        else setCsvDialogOpen(true);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {importResult ? 'Import Complete' : 'Upload CSV'}
            </DialogTitle>
            <DialogDescription>
              {importResult
                ? 'Your contacts have been imported.'
                : 'Upload a CSV file to import contacts in bulk.'}
            </DialogDescription>
          </DialogHeader>

          {importResult ? (
            /* Import result summary */
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-green-800 dark:text-green-200">
                    {importResult.importedCount} of {importResult.totalRows}{' '}
                    contacts imported
                  </p>
                  {importResult.skippedCount > 0 && (
                    <p className="text-green-700 dark:text-green-300">
                      {importResult.skippedCount} skipped
                    </p>
                  )}
                </div>
              </div>

              {importResult.skippedDetails.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Skipped rows:</p>
                  <div className="max-h-40 overflow-y-auto rounded-md border p-3 text-xs">
                    {importResult.skippedDetails.map((s, i) => (
                      <div key={i} className="text-muted-foreground py-0.5">
                        Row {s.row}: {s.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button onClick={closeCsvDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            /* File upload form */
            <div className="space-y-4">
              {csvError && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                  {csvError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="csv-file">Choose file</Label>
                <Input
                  ref={fileInputRef}
                  id="csv-file"
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileChange}
                />
              </div>

              <div className="text-muted-foreground rounded-md border p-3 text-xs leading-relaxed">
                <p className="mb-1 font-medium text-foreground">
                  Expected columns:
                </p>
                <p>
                  <strong>first_name</strong>, <strong>last_name</strong> (required)
                </p>
                <p>
                  <strong>email</strong> and/or <strong>phone</strong> (at least one)
                </p>
                <p>
                  <strong>invitation_channel</strong> (optional: email, sms,
                  both, none)
                </p>
                <p className="mt-1">
                  Common aliases like &quot;fname&quot;, &quot;lastname&quot;,
                  &quot;mobile&quot; are also recognized.
                </p>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={closeCsvDialog}
                  disabled={csvParsing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!csvFile || csvParsing}
                >
                  {csvParsing ? 'Importing...' : 'Import'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
