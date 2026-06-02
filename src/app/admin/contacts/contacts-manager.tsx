'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, Download, ArrowRight, Users, ArrowUpDown, ArrowDown, ArrowUp, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { AddContactSheet } from './add-contact-sheet';
import { ImportCsvDialog } from './import-csv-dialog';
import { GoogleSheetsSyncDialog } from './google-sheets-sync-dialog';
import {
  deleteMasterContactsBulk,
  getBulkDeletionImpact,
  type BulkDeletionImpact,
} from './actions';
import type { MasterContact } from '@/types/database';

interface Props {
  contacts: MasterContact[];
  eventCounts: Record<string, number>;
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  events: { id: string; title: string; date_start: string }[];
  pastContributors: string[];
  filters: {
    q: string;
    opt_event: string;
    opt_marketing: string;
    source: string;
    event_id: string;
    contributor: string;
    sort: string;
  };
}

type SortableKey =
  | 'last_name'
  | 'source'
  | 'sms_opt_in_event_updates'
  | 'sms_opt_in_marketing'
  | 'contributor_name'
  | 'created_at';

const SOURCE_LABEL: Record<MasterContact['source'], string> = {
  manual: 'Manual',
  csv_import: 'CSV import',
  google_sheets: 'Google Sheets',
  checkout: 'Checkout',
  rsvp: 'RSVP',
};

export function ContactsManager({
  contacts, eventCounts, total, page, totalPages, pageSize, events, pastContributors, filters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(filters.q);

  // Bulk selection (per-page; clears when the visible page changes)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [impact, setImpact] = useState<BulkDeletionImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // When pagination / filters shift the visible rows, drop any selection
  // that no longer corresponds to a visible row to avoid silently acting
  // on contacts the admin can't see.
  useEffect(() => {
    const visibleIds = new Set(contacts.map((c) => c.id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (visibleIds.has(id)) next.add(id);
      return next;
    });
  }, [contacts]);

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const allVisibleSelected = contacts.length > 0 &&
    contacts.every((c) => selectedIds.has(c.id));
  const someVisibleSelected = contacts.some((c) => selectedIds.has(c.id));

  function toggleAllVisible(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const c of contacts) next.add(c.id);
      } else {
        for (const c of contacts) next.delete(c.id);
      }
      return next;
    });
  }

  async function openDeleteDialog() {
    setImpact(null);
    setImpactLoading(true);
    setDeleteDialogOpen(true);
    const res = await getBulkDeletionImpact(Array.from(selectedIds));
    setImpactLoading(false);
    if (res.success && res.data) {
      setImpact(res.data);
    } else {
      // Fallback so the dialog still works without an impact preview
      setImpact({
        contactCount: selectedIds.size,
        upcomingTicketContacts: 0,
        upcomingEventCount: 0,
        pastTicketContacts: 0,
      });
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    const res = await deleteMasterContactsBulk(Array.from(selectedIds));
    setDeleting(false);
    if (!res.success) {
      toast.error(res.error ?? 'Failed to delete contacts.');
      return;
    }
    toast.success(`Deleted ${res.data?.deleted ?? 0} contact${(res.data?.deleted ?? 0) === 1 ? '' : 's'}.`);
    setSelectedIds(new Set());
    setDeleteDialogOpen(false);
    router.refresh();
  }

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `/admin/contacts?${qs}` : '/admin/contacts');
    });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchValue.trim() === filters.q) return;
      updateParams({ q: searchValue.trim() || null, page: null });
    }, 300);
    return () => clearTimeout(t);
    // updateParams reads searchParams which changes when q changes; intentional dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  // Cycle: not-sorted → asc → desc → not-sorted.
  function toggleSort(column: SortableKey) {
    const current = filters.sort;
    let next: string | null;
    if (current === column) next = `-${column}`;
    else if (current === `-${column}`) next = null;
    else next = column;
    updateParams({ sort: next, page: null });
  }

  const exportHref = `/admin/contacts/export${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const hasActiveFilters = Boolean(
    filters.q || filters.event_id || filters.source || filters.opt_event || filters.opt_marketing || filters.contributor
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <div className="flex items-center gap-2">
          <ImportCsvDialog pastContributors={pastContributors} />
          <GoogleSheetsSyncDialog pastContributors={pastContributors} />
          <Link
            href={exportHref}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Link>
          <AddContactSheet />
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search by name, email, or phone..."
              className="pl-9"
            />
          </div>
          <Select
            value={filters.opt_event || 'all'}
            onValueChange={(v) => updateParams({ opt_event: v === 'all' ? null : v, page: null })}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="SMS event updates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">SMS event: all</SelectItem>
              <SelectItem value="yes">SMS event: opted in</SelectItem>
              <SelectItem value="no">SMS event: not opted in</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.opt_marketing || 'all'}
            onValueChange={(v) => updateParams({ opt_marketing: v === 'all' ? null : v, page: null })}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="SMS marketing" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">SMS marketing: all</SelectItem>
              <SelectItem value="yes">SMS marketing: opted in</SelectItem>
              <SelectItem value="no">SMS marketing: not opted in</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.source || 'all'}
            onValueChange={(v) => updateParams({ source: v === 'all' ? null : v, page: null })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="csv_import">CSV import</SelectItem>
              <SelectItem value="google_sheets">Google Sheets</SelectItem>
              <SelectItem value="checkout">Checkout</SelectItem>
              <SelectItem value="rsvp">RSVP</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.event_id || 'all'}
            onValueChange={(v) => updateParams({ event_id: v === 'all' ? null : v, page: null })}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Event attended" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pastContributors.length > 0 && (
            <Select
              value={filters.contributor || 'all'}
              onValueChange={(v) => updateParams({ contributor: v === 'all' ? null : v, page: null })}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Contributor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All contributors</SelectItem>
                {pastContributors.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
          <span className="font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Clear
            </button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={openDeleteDialog}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete selected
            </Button>
          </div>
        </div>
      )}

      {contacts.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                      onCheckedChange={(v) => toggleAllVisible(v === true)}
                      aria-label="Select all on page"
                    />
                  </TableHead>
                  <TableHead>
                    <SortableHead label="Name" column="last_name" current={filters.sort} onClick={toggleSort} />
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>
                    <SortableHead label="SMS event" column="sms_opt_in_event_updates" current={filters.sort} onClick={toggleSort} />
                  </TableHead>
                  <TableHead>
                    <SortableHead label="SMS marketing" column="sms_opt_in_marketing" current={filters.sort} onClick={toggleSort} />
                  </TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>
                    <SortableHead label="Source" column="source" current={filters.sort} onClick={toggleSort} />
                  </TableHead>
                  <TableHead>
                    <SortableHead label="Contributor" column="contributor_name" current={filters.sort} onClick={toggleSort} />
                  </TableHead>
                  <TableHead>
                    <SortableHead label="Added" column="created_at" current={filters.sort} onClick={toggleSort} />
                  </TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id} className={pending ? 'opacity-60' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={(v) => toggleRow(c.id, v === true)}
                        aria-label={`Select ${c.email}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/admin/contacts/${c.id}`} className="hover:underline">
                        {`${c.first_name} ${c.last_name}`.trim() || '—'}
                      </Link>
                    </TableCell>
                    <TableCell>{c.email}</TableCell>
                    <TableCell>{c.phone ?? '—'}</TableCell>
                    <TableCell>
                      {c.sms_opt_in_event_updates
                        ? <Badge variant="default">Opted in</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {c.sms_opt_in_marketing
                        ? <Badge variant="default">Opted in</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>{eventCounts[c.id] ?? 0}</TableCell>
                    <TableCell className="text-muted-foreground">{SOURCE_LABEL[c.source]}</TableCell>
                    <TableCell className="text-muted-foreground">{c.contributor_name ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(c.created_at, 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/contacts/${c.id}`} className="text-muted-foreground hover:text-foreground inline-flex">
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">
              {hasActiveFilters
                ? 'No contacts match your filters'
                : 'No contacts yet — add one manually to get started'}
            </p>
            <AddContactSheet />
          </CardContent>
        </Card>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
              className="px-3 py-1.5 rounded-md border disabled:opacity-50 hover:bg-muted disabled:hover:bg-transparent"
            >
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
              className="px-3 py-1.5 rounded-md border disabled:opacity-50 hover:bg-muted disabled:hover:bg-transparent"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} contact{selectedIds.size === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>
              Each contact will be removed from the master list and from every event&rsquo;s contacts list. Their tickets and any sent messages remain (you&rsquo;ll just no longer see them tied to these people in the master list). This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {impactLoading && (
            <p className="text-muted-foreground text-sm">Checking impact…</p>
          )}

          {impact && impact.upcomingTicketContacts > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {impact.upcomingTicketContacts} of these contact{impact.upcomingTicketContacts === 1 ? ' has' : 's have'} active tickets across {impact.upcomingEventCount} upcoming event{impact.upcomingEventCount === 1 ? '' : 's'}.
                  </p>
                  <p className="mt-1 text-xs opacity-90">
                    Tickets remain valid for entry. Future invitations to those events won&rsquo;t auto-include these people unless you add them back.
                  </p>
                </div>
              </div>
            </div>
          )}

          {impact && impact.pastTicketContacts > 0 && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                {impact.pastTicketContacts} of these contact{impact.pastTicketContacts === 1 ? ' has' : 's have'} attended past events.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Attendee history and archive metrics stay accurate, but the link from those tickets back to these contacts is severed.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={deleting}
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || impactLoading}
              onClick={handleConfirmDelete}
            >
              {deleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableHead({
  label,
  column,
  current,
  onClick,
}: {
  label: string;
  column: SortableKey;
  current: string;
  onClick: (column: SortableKey) => void;
}) {
  const isAsc = current === column;
  const isDesc = current === `-${column}`;
  const Icon = isAsc ? ArrowUp : isDesc ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onClick(column)}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      <Icon className={`h-3.5 w-3.5 ${isAsc || isDesc ? 'opacity-100' : 'opacity-40'}`} />
    </button>
  );
}
