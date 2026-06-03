export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import { deliveryErrorLabel } from '@/lib/delivery-errors';
import type {
  Event, Contact, InvitationLog, MasterContact, Ticket,
} from '@/types/database';
import { ContactDetail } from './contact-detail';

interface EventRow {
  contactRowId: string;          // contacts.id
  event: Pick<Event, 'id' | 'title' | 'date_start' | 'status'>;
  invitationChannel: Contact['invitation_channel'];
  invitedAt: string | null;
  role: 'Attendee' | 'RSVP' | 'Invitee';
  tierName: string | null;
}

interface LogRow {
  log: InvitationLog;
  event: Pick<Event, 'id' | 'title'>;
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: masterContact, error: mcErr } = await supabase
    .from('master_contacts')
    .select('*')
    .eq('id', id)
    .single();
  if (mcErr || !masterContact) notFound();
  const mc = masterContact as MasterContact;

  // Event history: contacts rows for this master_contact, joined with events.
  const { data: contactRows } = await supabase
    .from('contacts')
    .select('id, event_id, invitation_channel, invited_at, events!inner(id, title, date_start, status)')
    .eq('master_contact_id', mc.id)
    .order('created_at', { ascending: false });

  const contactIds = (contactRows ?? []).map((r) => r.id as string);
  const eventIds = (contactRows ?? [])
    .map((r) => (Array.isArray(r.events) ? r.events[0]?.id : (r.events as Event | null)?.id))
    .filter(Boolean) as string[];

  // Tickets for this contact (matched by email — covers walk-ins where contact_id may be null).
  const { data: ticketsData } = await supabase
    .from('tickets')
    .select('id, event_id, tier_id, status, amount_paid_cents, contact_id, attendee_email')
    .or(`contact_id.in.(${contactIds.length ? contactIds.join(',') : '00000000-0000-0000-0000-000000000000'}),attendee_email.eq.${mc.email}`);
  const tickets = (ticketsData ?? []) as Ticket[];

  // Tier names (for showing the tier on Attendee rows).
  const tierIds = Array.from(new Set(tickets.map((t) => t.tier_id))).filter(Boolean);
  const { data: tierData } = tierIds.length
    ? await supabase.from('ticket_tiers').select('id, name').in('id', tierIds)
    : { data: [] };
  const tierNameById = new Map<string, string>(
    (tierData ?? []).map((t) => [t.id as string, t.name as string])
  );

  const eventHistory: EventRow[] = (contactRows ?? []).map((row) => {
    const eventObj = (Array.isArray(row.events) ? row.events[0] : row.events) as
      Pick<Event, 'id' | 'title' | 'date_start' | 'status'>;
    const ticketsForEvent = tickets.filter((t) => t.event_id === eventObj.id);
    const liveTickets = ticketsForEvent.filter(
      (t) => t.status === 'confirmed' || t.status === 'checked_in'
    );
    let role: EventRow['role'] = 'Invitee';
    let tierName: string | null = null;
    if (liveTickets.length > 0) {
      const t = liveTickets[0];
      role = t.amount_paid_cents > 0 ? 'Attendee' : 'RSVP';
      tierName = tierNameById.get(t.tier_id) ?? null;
    }
    return {
      contactRowId: row.id as string,
      event: eventObj,
      invitationChannel: row.invitation_channel as Contact['invitation_channel'],
      invitedAt: (row.invited_at as string | null) ?? null,
      role,
      tierName,
    };
  });

  // Delete-impact summary: which events the contact has confirmed tickets
  // for, split into upcoming vs past. tickets and invitation_logs stay (FKs
  // are ON DELETE SET NULL), so this is informational — the warning is
  // about losing the link from this person to those records.
  const now = new Date();
  const ticketEvents = eventHistory.filter(
    (r) => r.role === 'Attendee' || r.role === 'RSVP'
  );
  const upcomingTicketEvents = ticketEvents
    .filter((r) => new Date(r.event.date_start) > now)
    .map((r) => ({ id: r.event.id, title: r.event.title, date_start: r.event.date_start }));
  const pastTicketEvents = ticketEvents
    .filter((r) => new Date(r.event.date_start) <= now)
    .map((r) => ({ id: r.event.id, title: r.event.title, date_start: r.event.date_start }));

  // Message history: invitation_logs for this contact across all events.
  let messageHistory: LogRow[] = [];
  if (contactIds.length > 0 && eventIds.length > 0) {
    const { data: logsData } = await supabase
      .from('invitation_logs')
      .select('*')
      .in('contact_id', contactIds)
      .order('sent_at', { ascending: false });
    const logs = (logsData ?? []) as InvitationLog[];
    const titleById = new Map<string, string>(
      eventHistory.map((r) => [r.event.id, r.event.title])
    );
    messageHistory = logs.map((log) => ({
      log,
      event: { id: log.event_id, title: titleById.get(log.event_id) ?? '—' },
    }));
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link
        href="/admin/contacts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        All contacts
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          {`${mc.first_name} ${mc.last_name}`.trim() || mc.email}
        </h1>
        <p className="text-muted-foreground">{mc.email}</p>
      </div>

      <ContactDetail
        contact={mc}
        upcomingTicketEvents={upcomingTicketEvents}
        pastTicketEvents={pastTicketEvents}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Event history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {eventHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">
              This contact isn&rsquo;t linked to any events yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Invited</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventHistory.map((r) => (
                  <TableRow key={r.contactRowId}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/events/${r.event.id}`} className="hover:underline">
                        {r.event.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.event.date_start, 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        r.role === 'Attendee' ? 'default'
                          : r.role === 'RSVP' ? 'secondary'
                          : 'outline'
                      }>
                        {r.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.tierName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.invitationChannel}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.invitedAt ? formatDate(r.invitedAt, 'MMM d, yyyy') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Message history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {messageHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">
              No messages have been sent to this contact yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messageHistory.map(({ log, event }) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{event.title}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {log.message_type.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{log.channel}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(log.sent_at, 'MMM d, yyyy h:mm a')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-0.5">
                        <Badge variant={
                          log.status === 'delivered' ? 'default'
                            : log.status === 'sent' ? 'secondary'
                            : 'destructive'
                        }>
                          {log.status}
                        </Badge>
                        {(log.status === 'failed' || log.status === 'bounced') && (
                          <span className="text-xs text-destructive">
                            {deliveryErrorLabel(log.channel, log.error_code)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
