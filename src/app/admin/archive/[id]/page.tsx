export const dynamic = 'force-dynamic';

import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Ticket,
  DollarSign,
  CheckCircle2,
  Users,
  FileSpreadsheet,
  Mail,
  MessageSquare,
  MapPin,
} from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExportCsvButton } from './export-csv-button';
import { DeleteEventButton } from './delete-event-button';
import type { TicketStatus } from '@/types/database';

function formatCents(cents: number): string {
  if (cents === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function ticketStatusVariant(status: TicketStatus) {
  switch (status) {
    case 'checked_in':
      return 'default' as const;
    case 'confirmed':
      return 'secondary' as const;
    case 'cancelled':
    case 'refunded':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
}

interface ArchiveDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ArchiveDetailPage({
  params,
}: ArchiveDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: event },
    { data: tiers },
    { data: tickets },
    { data: invitationLogs },
    { data: csvImports },
  ] = await Promise.all([
    supabase
      .from('events')
      .select(
        'id, title, date_start, date_end, location_name, cover_image_url, status, archived_at'
      )
      .eq('id', id)
      .single(),

    supabase
      .from('ticket_tiers')
      .select('name, price_cents, quantity_total, quantity_sold')
      .eq('event_id', id)
      .order('sort_order', { ascending: true }),

    supabase
      .from('tickets')
      .select(
        'attendee_name, attendee_email, attendee_phone, quantity, amount_paid_cents, status, checked_in_at, ticket_tiers(name)'
      )
      .eq('event_id', id)
      .order('purchased_at', { ascending: false }),

    supabase
      .from('invitation_logs')
      .select('message_type, channel, status')
      .eq('event_id', id),

    supabase
      .from('csv_imports')
      .select(
        'id, filename, row_count, imported_count, skipped_count, imported_at'
      )
      .eq('event_id', id)
      .order('imported_at', { ascending: false }),
  ]);

  if (!event || event.status !== 'archived') {
    notFound();
  }

  // Compute stats
  const activeTickets = (tickets ?? []).filter(
    (t) => t.status === 'confirmed' || t.status === 'checked_in'
  );
  const totalRevenue = activeTickets.reduce(
    (sum, t) => sum + t.amount_paid_cents,
    0
  );
  const totalSold = activeTickets.reduce((sum, t) => sum + t.quantity, 0);
  const checkedInCount = activeTickets
    .filter((t) => t.status === 'checked_in')
    .reduce((sum, t) => sum + t.quantity, 0);
  const attendanceRate =
    totalSold > 0 ? Math.round((checkedInCount / totalSold) * 100) : 0;

  // Messaging stats
  const logs = invitationLogs ?? [];
  const invitations = logs.filter((l) => l.message_type === 'invitation');
  const thankYous = logs.filter((l) => l.message_type === 'thank_you');

  const invitationStats = {
    emailSent: invitations.filter((l) => l.channel === 'email').length,
    smsSent: invitations.filter((l) => l.channel === 'sms').length,
    delivered: invitations.filter((l) => l.status === 'delivered').length,
    failed: invitations.filter(
      (l) => l.status === 'failed' || l.status === 'bounced'
    ).length,
  };

  const thankYouStats = {
    emailSent: thankYous.filter((l) => l.channel === 'email').length,
    smsSent: thankYous.filter((l) => l.channel === 'sms').length,
  };

  // Tier revenue breakdown
  const tiersData = (tiers ?? []).map((tier) => ({
    ...tier,
    revenue: tier.quantity_sold * tier.price_cents,
  }));

  // Prepare ticket data for CSV export
  const ticketRows = (tickets ?? []).map((t) => ({
    attendee_name: t.attendee_name,
    attendee_email: t.attendee_email,
    attendee_phone: t.attendee_phone,
    quantity: t.quantity,
    amount_paid_cents: t.amount_paid_cents,
    status: t.status,
    checked_in_at: t.checked_in_at,
    tier_name:
      (t.ticket_tiers as unknown as { name: string } | null)?.name ?? '—',
  }));

  const stats = [
    {
      title: 'Tickets Sold',
      value: totalSold.toLocaleString(),
      icon: Ticket,
    },
    {
      title: 'Revenue',
      value: formatCents(totalRevenue),
      icon: DollarSign,
    },
    {
      title: 'Checked In',
      value: checkedInCount.toLocaleString(),
      icon: CheckCircle2,
    },
    {
      title: 'Attendance Rate',
      value: `${attendanceRate}%`,
      icon: Users,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/admin/archive"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Archive
        </Link>

        {event.cover_image_url && (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg mb-4">
            <Image
              src={event.cover_image_url}
              alt={event.title}
              fill
              className="object-cover"
            />
          </div>
        )}

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{event.title}</h1>
              <Badge variant="outline">Archived</Badge>
            </div>
            {event.archived_at && (
              <p className="text-sm text-muted-foreground mb-1">
                Archived on{' '}
                {format(new Date(event.archived_at), 'MMM d, yyyy')}
              </p>
            )}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                {format(new Date(event.date_start), 'MMM d, yyyy h:mm a')}
                {' — '}
                {format(new Date(event.date_end), 'MMM d, yyyy h:mm a')}
              </span>
              {event.location_name && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {event.location_name}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tiers breakdown */}
      {tiersData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ticket Tiers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tier</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="text-center">Sold / Total</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tiersData.map((tier) => (
                    <TableRow key={tier.name}>
                      <TableCell className="font-medium">{tier.name}</TableCell>
                      <TableCell>{formatCents(tier.price_cents)}</TableCell>
                      <TableCell className="text-center">
                        {tier.quantity_sold} / {tier.quantity_total}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCents(tier.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attendee list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Attendees</CardTitle>
          {ticketRows.length > 0 && (
            <ExportCsvButton tickets={ticketRows} eventTitle={event.title} />
          )}
        </CardHeader>
        <CardContent>
          {ticketRows.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ticketRows.map((ticket, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        {ticket.attendee_name}
                      </TableCell>
                      <TableCell>{ticket.attendee_email ?? '—'}</TableCell>
                      <TableCell>{ticket.attendee_phone ?? '—'}</TableCell>
                      <TableCell>{ticket.tier_name}</TableCell>
                      <TableCell className="text-center">
                        {ticket.quantity}
                      </TableCell>
                      <TableCell>
                        {formatCents(ticket.amount_paid_cents)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={ticketStatusVariant(
                            ticket.status as TicketStatus
                          )}
                        >
                          {ticket.status === 'checked_in'
                            ? 'Checked In'
                            : ticket.status.charAt(0).toUpperCase() +
                              ticket.status.slice(1)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-6">
              No attendees for this event.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Messaging stats */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Messaging</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Invitations */}
            {invitations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Invitations
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">Emails sent</div>
                    <div className="text-lg font-semibold">
                      {invitationStats.emailSent}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">SMS sent</div>
                    <div className="text-lg font-semibold">
                      {invitationStats.smsSent}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">Delivered</div>
                    <div className="text-lg font-semibold">
                      {invitationStats.delivered}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">Failed</div>
                    <div className="text-lg font-semibold">
                      {invitationStats.failed}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Thank-Yous */}
            {thankYous.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Thank-You Messages
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">Emails sent</div>
                    <div className="text-lg font-semibold">
                      {thankYouStats.emailSent}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-muted-foreground">SMS sent</div>
                    <div className="text-lg font-semibold">
                      {thankYouStats.smsSent}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* CSV import history */}
      {csvImports && csvImports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>CSV Import History</CardTitle>
          </CardHeader>
          <CardContent>
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
                    {format(
                      new Date(imp.imported_at),
                      'MMM d, yyyy h:mm a'
                    )}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Permanently delete this event and all associated data.
          </p>
          <DeleteEventButton eventId={event.id} eventTitle={event.title} />
        </CardContent>
      </Card>
    </div>
  );
}
