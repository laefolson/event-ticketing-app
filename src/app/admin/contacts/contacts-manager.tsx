'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, Download, ArrowRight, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { AddContactSheet } from './add-contact-sheet';
import { ImportCsvDialog } from './import-csv-dialog';
import { GoogleSheetsSyncDialog } from './google-sheets-sync-dialog';
import type { MasterContact } from '@/types/database';

interface Props {
  contacts: MasterContact[];
  eventCounts: Record<string, number>;
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  events: { id: string; title: string; date_start: string }[];
  filters: {
    q: string;
    opt_event: string;
    opt_marketing: string;
    source: string;
    event_id: string;
  };
}

const SOURCE_LABEL: Record<MasterContact['source'], string> = {
  manual: 'Manual',
  csv_import: 'CSV import',
  google_sheets: 'Google Sheets',
  checkout: 'Checkout',
  rsvp: 'RSVP',
};

export function ContactsManager({
  contacts, eventCounts, total, page, totalPages, pageSize, events, filters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(filters.q);

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

  const exportHref = `/admin/contacts/export${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const hasActiveFilters = Boolean(
    filters.q || filters.event_id || filters.source || filters.opt_event || filters.opt_marketing
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <div className="flex items-center gap-2">
          <ImportCsvDialog />
          <GoogleSheetsSyncDialog />
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
        </CardContent>
      </Card>

      {contacts.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>SMS event</TableHead>
                  <TableHead>SMS marketing</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id} className={pending ? 'opacity-60' : ''}>
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
    </div>
  );
}
