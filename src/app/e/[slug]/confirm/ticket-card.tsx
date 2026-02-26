'use client';

import { useRef, useCallback, useState } from 'react';
import { toPng } from 'html-to-image';
import { Download, Calendar, MapPin, Hash, Ticket, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TicketCardProps {
  eventTitle: string;
  dateFormatted: string;
  locationName: string | null;
  attendeeName: string;
  tierName: string;
  quantity: number;
  ticketCode: string;
}

export function TicketCard({
  eventTitle,
  dateFormatted,
  locationName,
  attendeeName,
  tierName,
  quantity,
  ticketCode,
}: TicketCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    setDownloading(true);

    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#1c1917', // stone-950
      });

      const link = document.createElement('a');
      link.download = `ticket-${ticketCode}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to generate ticket image:', err);
    } finally {
      setDownloading(false);
    }
  }, [ticketCode]);

  return (
    <div className="mt-6 space-y-3">
      {/* The card to capture */}
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-xl border border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900"
      >
        {/* Top accent bar */}
        <div className="h-2 bg-gradient-to-r from-stone-800 to-stone-600 dark:from-stone-300 dark:to-stone-500" />

        <div className="px-6 py-5 space-y-4">
          {/* Event title */}
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-stone-500 dark:text-stone-400">
              Event
            </p>
            <h3 className="text-xl font-bold text-stone-900 dark:text-stone-50">
              {eventTitle}
            </h3>
          </div>

          {/* Date + Location row */}
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <div className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
              <Calendar className="h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400" />
              <span>{dateFormatted}</span>
            </div>
            {locationName && (
              <div className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
                <MapPin className="h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400" />
                <span>{locationName}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-stone-300 dark:border-stone-700" />

          {/* Attendee + Tier + Quantity */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Attendee
              </p>
              <p className="mt-0.5 text-sm font-semibold text-stone-900 dark:text-stone-50">
                {attendeeName}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Tier
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-50">
                <Ticket className="h-3.5 w-3.5 text-stone-500 dark:text-stone-400" />
                {tierName}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Qty
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-stone-50">
                <Users className="h-3.5 w-3.5 text-stone-500 dark:text-stone-400" />
                {quantity}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-stone-300 dark:border-stone-700" />

          {/* Ticket code */}
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-stone-500 dark:text-stone-400" />
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Ticket Code
              </p>
              <p className="font-mono text-lg font-bold tracking-wider text-stone-900 dark:text-stone-50">
                {ticketCode}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Download button (outside the captured area) */}
      <Button
        variant="outline"
        onClick={handleDownload}
        disabled={downloading}
        className="w-full"
      >
        <Download className="mr-2 h-4 w-4" />
        {downloading ? 'Generating...' : 'Download Ticket'}
      </Button>
    </div>
  );
}
