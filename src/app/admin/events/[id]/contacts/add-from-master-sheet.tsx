'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  searchMasterContactsForEvent,
  getMasterContactsForPriorEvent,
  getMasterContactsByOptIn,
  getMasterContactsByContributor,
  addMasterContactsToEvent,
  type PickableMasterContact,
} from './actions';

type AddedBy = 'manual' | 'event_copy';

interface StagedContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  addedBy: AddedBy;
}

interface AddFromMasterSheetProps {
  eventId: string;
  priorEvents: { id: string; title: string }[];
  pastContributors: string[];
}

function displayName(c: { first_name: string; last_name: string; email: string }) {
  return `${c.first_name} ${c.last_name}`.trim() || c.email;
}

export function AddFromMasterSheet({ eventId, priorEvents, pastContributors }: AddFromMasterSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Staging
  const [staged, setStaged] = useState<StagedContact[]>([]);
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email');
  const [submitting, startSubmit] = useTransition();

  // Search & Select
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PickableMasterContact[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('search');

  // Prior Event
  const [priorEventId, setPriorEventId] = useState<string>('');
  const [attendeesOnly, setAttendeesOnly] = useState(false);
  const [priorResults, setPriorResults] = useState<PickableMasterContact[]>([]);
  const [priorLoading, setPriorLoading] = useState(false);

  // Opt-In
  const [optEvent, setOptEvent] = useState(false);
  const [optMarketing, setOptMarketing] = useState(false);
  const [optResults, setOptResults] = useState<PickableMasterContact[]>([]);
  const [optLoading, setOptLoading] = useState(false);

  // Contributor
  const [contributor, setContributor] = useState<string>('');
  const [contributorResults, setContributorResults] = useState<PickableMasterContact[]>([]);
  const [contributorLoading, setContributorLoading] = useState(false);

  function resetAll() {
    setStaged([]);
    setChannel('email');
    setSearchQuery('');
    setSearchResults([]);
    setPriorEventId('');
    setAttendeesOnly(false);
    setPriorResults([]);
    setOptEvent(false);
    setOptMarketing(false);
    setOptResults([]);
    setContributor('');
    setContributorResults([]);
    setActiveTab('search');
  }

  // Debounced search. setSearchLoading(true) is intentional UI state for the
  // pending fetch — the rule's autofix would lose the loading indicator.
  useEffect(() => {
    if (!open || activeTab !== 'search') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchLoading(true);
    const t = setTimeout(async () => {
      const res = await searchMasterContactsForEvent(eventId, searchQuery);
      if (res.success) setSearchResults(res.data ?? []);
      setSearchLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, open, activeTab, eventId]);

  useEffect(() => {
    if (!open || activeTab !== 'prior' || !priorEventId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPriorResults([]);
      return;
    }
    setPriorLoading(true);
    (async () => {
      const res = await getMasterContactsForPriorEvent(eventId, priorEventId, attendeesOnly);
      if (res.success) setPriorResults(res.data ?? []);
      setPriorLoading(false);
    })();
  }, [priorEventId, attendeesOnly, open, activeTab, eventId]);

  useEffect(() => {
    if (!open || activeTab !== 'optin') return;
    if (!optEvent && !optMarketing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptResults([]);
      return;
    }
    setOptLoading(true);
    (async () => {
      const res = await getMasterContactsByOptIn(eventId, optEvent, optMarketing);
      if (res.success) setOptResults(res.data ?? []);
      setOptLoading(false);
    })();
  }, [optEvent, optMarketing, open, activeTab, eventId]);

  useEffect(() => {
    if (!open || activeTab !== 'contributor' || !contributor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContributorResults([]);
      return;
    }
    setContributorLoading(true);
    (async () => {
      const res = await getMasterContactsByContributor(eventId, contributor);
      if (res.success) setContributorResults(res.data ?? []);
      setContributorLoading(false);
    })();
  }, [contributor, open, activeTab, eventId]);

  function toggleStaged(c: PickableMasterContact, addedBy: AddedBy) {
    setStaged((prev) => {
      if (prev.find((s) => s.id === c.id)) {
        return prev.filter((s) => s.id !== c.id);
      }
      return [
        ...prev,
        {
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          addedBy,
        },
      ];
    });
  }
  function isStaged(id: string) {
    return Boolean(staged.find((s) => s.id === id));
  }
  function unstage(id: string) {
    setStaged((prev) => prev.filter((s) => s.id !== id));
  }

  function handleSubmit() {
    if (staged.length === 0) return;
    startSubmit(async () => {
      const res = await addMasterContactsToEvent(
        eventId,
        staged.map((s) => ({ masterContactId: s.id, addedBy: s.addedBy })),
        channel
      );
      if (!res.success) {
        toast.error(res.error ?? 'Failed to add contacts');
        return;
      }
      const { added, alreadyInEvent } = res.data!;
      if (added > 0 && alreadyInEvent > 0) {
        toast.success(`Added ${added} · ${alreadyInEvent} already in this event`);
      } else if (added > 0) {
        toast.success(`Added ${added} contact${added === 1 ? '' : 's'} to event`);
      } else {
        toast.info('All selected contacts were already in this event');
      }
      setOpen(false);
      resetAll();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetAll(); }}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Users className="h-4 w-4 mr-2" />
          Add from Master List
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>Add from master list</SheetTitle>
          <SheetDescription>
            Pick existing contacts to add to this event. Already-linked contacts are skipped silently.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden mt-4">
          <div className="px-6">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="search">Search</TabsTrigger>
              <TabsTrigger value="prior">Prior Event</TabsTrigger>
              <TabsTrigger value="optin">Opt-In</TabsTrigger>
              <TabsTrigger value="contributor">Contributor</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="search" className="flex-1 overflow-hidden flex flex-col px-6 mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <ResultsList
              loading={searchLoading}
              rows={searchResults}
              isStaged={isStaged}
              toggle={(c) => toggleStaged(c, 'manual')}
              emptyMessage={searchQuery ? 'No master contacts match this search.' : 'Type to search the master list.'}
            />
          </TabsContent>

          <TabsContent value="prior" className="flex-1 overflow-hidden flex flex-col px-6 mt-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px] space-y-1.5">
                <Label htmlFor="prior-event-select">Prior event</Label>
                <Select value={priorEventId} onValueChange={setPriorEventId}>
                  <SelectTrigger id="prior-event-select" className="w-full">
                    <SelectValue placeholder="Choose an event..." />
                  </SelectTrigger>
                  <SelectContent>
                    {priorEvents.length === 0 ? (
                      <SelectItem value="__none__" disabled>No other events yet</SelectItem>
                    ) : (
                      priorEvents.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="attendees-only"
                  checked={attendeesOnly}
                  onCheckedChange={(v) => setAttendeesOnly(Boolean(v))}
                />
                <Label htmlFor="attendees-only" className="cursor-pointer">
                  Attendees only
                </Label>
              </div>
            </div>
            <ResultsList
              loading={priorLoading}
              rows={priorResults}
              isStaged={isStaged}
              toggle={(c) => toggleStaged(c, 'event_copy')}
              emptyMessage={priorEventId ? 'No contacts found for the selected event.' : 'Choose a prior event to see its contacts.'}
            />
          </TabsContent>

          <TabsContent value="optin" className="flex-1 overflow-hidden flex flex-col px-6 mt-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="opt-event"
                  checked={optEvent}
                  onCheckedChange={(v) => setOptEvent(Boolean(v))}
                />
                <Label htmlFor="opt-event" className="cursor-pointer">
                  SMS event updates opted in
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="opt-marketing"
                  checked={optMarketing}
                  onCheckedChange={(v) => setOptMarketing(Boolean(v))}
                />
                <Label htmlFor="opt-marketing" className="cursor-pointer">
                  SMS marketing opted in
                </Label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Contacts already linked to this event are excluded automatically.
            </p>
            <ResultsList
              loading={optLoading}
              rows={optResults}
              isStaged={isStaged}
              toggle={(c) => toggleStaged(c, 'manual')}
              emptyMessage={(!optEvent && !optMarketing) ? 'Pick at least one opt-in.' : 'No matching contacts.'}
            />
          </TabsContent>

          <TabsContent value="contributor" className="flex-1 overflow-hidden flex flex-col px-6 mt-3">
            <div className="space-y-1.5">
              <Label htmlFor="contributor-select">Contributor</Label>
              <Select value={contributor} onValueChange={setContributor}>
                <SelectTrigger id="contributor-select" className="w-full">
                  <SelectValue placeholder="Choose a contributor..." />
                </SelectTrigger>
                <SelectContent>
                  {pastContributors.length === 0 ? (
                    <SelectItem value="__none__" disabled>No contributors yet</SelectItem>
                  ) : (
                    pastContributors.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Contacts already linked to this event are excluded automatically.
              </p>
            </div>
            <ResultsList
              loading={contributorLoading}
              rows={contributorResults}
              isStaged={isStaged}
              toggle={(c) => toggleStaged(c, 'manual')}
              emptyMessage={contributor ? 'No master contacts from this contributor (or all are already in the event).' : 'Pick a contributor to see their contacts.'}
            />
          </TabsContent>
        </Tabs>

        <div className="border-t bg-muted/30 px-6 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {staged.length} {staged.length === 1 ? 'contact' : 'contacts'} staged
            </p>
            {staged.length > 0 && (
              <button
                type="button"
                onClick={() => setStaged([])}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear all
              </button>
            )}
          </div>
          {staged.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {staged.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded-full bg-background border px-2 py-0.5 text-xs"
                >
                  {displayName(s)}
                  <button
                    type="button"
                    onClick={() => unstage(s.id)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Remove from staging"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="batch-channel" className="text-xs">Invitation channel for all staged</Label>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as 'email' | 'sms' | 'both')}
              >
                <SelectTrigger id="batch-channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={staged.length === 0 || submitting}
              className="self-end"
            >
              {submitting
                ? 'Adding…'
                : `Add ${staged.length} to event`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ResultsList({
  loading,
  rows,
  isStaged,
  toggle,
  emptyMessage,
}: {
  loading: boolean;
  rows: PickableMasterContact[];
  isStaged: (id: string) => boolean;
  toggle: (c: PickableMasterContact) => void;
  emptyMessage: string;
}) {
  return (
    <div className="mt-3 flex-1 overflow-y-auto rounded-md border">
      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <ul className="divide-y">
          {rows.map((c) => {
            const staged = isStaged(c.id);
            const disabled = c.isAlreadyInEvent;
            return (
              <li
                key={c.id}
                className={`flex items-center gap-3 px-3 py-2 ${disabled ? 'opacity-60' : ''}`}
              >
                <Checkbox
                  checked={staged}
                  disabled={disabled}
                  onCheckedChange={() => !disabled && toggle(c)}
                  aria-label={`Select ${displayName(c)}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {displayName(c)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                    <span>{c.email}</span>
                    {c.phone && <span>· {c.phone}</span>}
                    <span>· {c.eventCount} event{c.eventCount === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.sms_opt_in_event_updates && (
                    <Badge variant="secondary" className="text-[10px]">SMS event</Badge>
                  )}
                  {c.sms_opt_in_marketing && (
                    <Badge variant="secondary" className="text-[10px]">SMS marketing</Badge>
                  )}
                  {disabled && (
                    <Badge variant="outline" className="text-[10px]">Already in event</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
