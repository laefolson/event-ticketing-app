'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TicketRow {
  attendee_name: string;
  attendee_email: string | null;
  attendee_phone: string | null;
  quantity: number;
  amount_paid_cents: number;
  status: string;
  checked_in_at: string | null;
  tier_name: string;
}

interface ExportCsvButtonProps {
  tickets: TicketRow[];
  eventTitle: string;
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function ExportCsvButton({ tickets, eventTitle }: ExportCsvButtonProps) {
  function handleExport() {
    const headers = [
      'Name',
      'Email',
      'Phone',
      'Tier',
      'Quantity',
      'Amount Paid',
      'Status',
      'Checked In At',
    ];

    const rows = tickets.map((t) => [
      escapeCsv(t.attendee_name),
      escapeCsv(t.attendee_email ?? ''),
      escapeCsv(t.attendee_phone ?? ''),
      escapeCsv(t.tier_name),
      String(t.quantity),
      (t.amount_paid_cents / 100).toFixed(2),
      t.status,
      t.checked_in_at ?? '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${eventTitle.replace(/[^a-zA-Z0-9-_ ]/g, '')}-attendees.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  );
}
