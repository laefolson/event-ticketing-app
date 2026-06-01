'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, CheckCircle2, AlertCircle, AlertTriangle, X } from 'lucide-react';
import QrScanner from 'qr-scanner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { checkInByCode, lookupTicketByCode } from './actions';

const SUCCESS_BANNER_MS = 1600;

type Overlay =
  | { kind: 'idle' }
  | {
      kind: 'confirm';
      ticketCode: string;
      attendeeName: string;
      tierName: string;
      quantity: number;
      alreadyCheckedIn: boolean;
    }
  | { kind: 'success'; attendeeName: string; tierName: string; quantity: number }
  | { kind: 'already'; attendeeName: string; tierName: string; quantity: number }
  | { kind: 'error'; message: string; ticketCode?: string };

function extractTicketCode(scanned: string): string | null {
  if (!scanned) return null;
  const s = scanned.trim();
  const m = s.match(/\/verify\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{4,120}$/.test(s)) return s;
  return null;
}

function quantityLabel(n: number) {
  return n === 1 ? '1 ticket' : `${n} tickets`;
}

export function ScanDialog({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [overlay, setOverlay] = useState<Overlay>({ kind: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);

  // Refs the QR scanner callback reads from so the callback identity never
  // changes — that's what avoids tearing down the scanner every time the
  // overlay state flips.
  const overlayRef = useRef<Overlay>(overlay);
  const lastCodeRef = useRef<string | null>(null);
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  // Mount the camera once per dialog open, tear it down on close.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let scanner: QrScanner | null = null;

    (async () => {
      try {
        const cameraAvailable = await QrScanner.hasCamera();
        if (cancelled) return;
        setHasCamera(cameraAvailable);
        if (!cameraAvailable) {
          setStartError('No camera detected on this device.');
          return;
        }
        if (!videoRef.current) return;

        scanner = new QrScanner(
          videoRef.current,
          async (result) => {
            // Block while any non-idle overlay is showing.
            if (overlayRef.current.kind !== 'idle') return;
            const code = extractTicketCode(result.data);
            if (!code) return;
            // Debounce the same code held in view.
            if (lastCodeRef.current === code) return;
            lastCodeRef.current = code;

            const r = await lookupTicketByCode(eventId, code);
            if (!r.success || !r.data) {
              setOverlay({ kind: 'error', message: r.error ?? 'Check-in failed.', ticketCode: code });
              return;
            }
            setOverlay({
              kind: 'confirm',
              ticketCode: code,
              attendeeName: r.data.attendeeName,
              tierName: r.data.tierName,
              quantity: r.data.quantity,
              alreadyCheckedIn: r.data.status === 'checked_in',
            });
          },
          {
            preferredCamera: 'environment',
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 4,
          }
        );
        await scanner.start();
      } catch (err) {
        if (cancelled) return;
        setStartError(
          err instanceof Error
            ? err.message
            : 'Failed to start the camera. Allow camera access and try again.'
        );
      }
    })();

    return () => {
      cancelled = true;
      if (scanner) {
        scanner.stop();
        scanner.destroy();
      }
      // Reset transient state for the next open.
      setOverlay({ kind: 'idle' });
      setSubmitting(false);
      setStartError(null);
      setHasCamera(null);
      lastCodeRef.current = null;
    };
  }, [open, eventId]);

  function dismissOverlay() {
    lastCodeRef.current = null;
    setOverlay({ kind: 'idle' });
  }

  async function confirmCheckIn() {
    if (overlay.kind !== 'confirm') return;
    setSubmitting(true);
    const result = await checkInByCode(eventId, overlay.ticketCode);
    setSubmitting(false);
    if (!result.success || !result.data) {
      setOverlay({ kind: 'error', message: result.error ?? 'Check-in failed.' });
      return;
    }
    if (result.data.alreadyCheckedIn) {
      setOverlay({
        kind: 'already',
        attendeeName: result.data.attendeeName,
        tierName: result.data.tierName,
        quantity: result.data.quantity,
      });
    } else {
      setOverlay({
        kind: 'success',
        attendeeName: result.data.attendeeName,
        tierName: result.data.tierName,
        quantity: result.data.quantity,
      });
      window.setTimeout(dismissOverlay, SUCCESS_BANNER_MS);
    }
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ScanLine className="mr-2 h-4 w-4" />
          Scan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan ticket QR</DialogTitle>
          <DialogDescription>
            Point the camera at an attendee&rsquo;s QR code, then confirm to check them in.
          </DialogDescription>
        </DialogHeader>

        {startError && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
            {startError}
          </div>
        )}

        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
          />

          {hasCamera === false && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
              No camera available
            </div>
          )}

          {/* CONFIRM */}
          {overlay.kind === 'confirm' && (
            <div className="absolute inset-0 flex flex-col items-stretch justify-end gap-3 bg-black/70 p-4">
              <div className="rounded-lg bg-background p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {overlay.alreadyCheckedIn ? 'Already checked in' : 'Check in'}
                </p>
                <p className="mt-1 text-xl font-semibold">{overlay.attendeeName}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{overlay.tierName}</p>
                <p className="mt-3 text-3xl font-bold">{quantityLabel(overlay.quantity)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-14 text-base"
                  onClick={dismissOverlay}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  size="lg"
                  className="h-14 text-base"
                  onClick={confirmCheckIn}
                  disabled={submitting}
                >
                  {submitting
                    ? 'Checking in…'
                    : overlay.alreadyCheckedIn
                    ? 'Dismiss'
                    : 'Check In'}
                </Button>
              </div>
            </div>
          )}

          {/* SUCCESS */}
          {overlay.kind === 'success' && (
            <div className="absolute inset-x-0 bottom-0 bg-green-600/95 px-4 py-3 text-white">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Checked in: {overlay.attendeeName}</p>
                  <p className="text-xs opacity-90">
                    {overlay.tierName} · {quantityLabel(overlay.quantity)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ALREADY */}
          {overlay.kind === 'already' && (
            <div className="absolute inset-0 flex flex-col items-stretch justify-end gap-3 bg-black/70 p-4">
              <div className="rounded-lg bg-background p-4 text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
                <p className="mt-1 text-sm text-muted-foreground">Already checked in</p>
                <p className="mt-1 text-xl font-semibold">{overlay.attendeeName}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {overlay.tierName} · {quantityLabel(overlay.quantity)}
                </p>
              </div>
              <Button size="lg" className="h-14 text-base" onClick={dismissOverlay}>
                Got it
              </Button>
            </div>
          )}

          {/* ERROR */}
          {overlay.kind === 'error' && (
            <div className="absolute inset-0 flex flex-col items-stretch justify-end gap-3 bg-black/70 p-4">
              <div className="rounded-lg bg-background p-4 text-center">
                <AlertCircle className="mx-auto h-6 w-6 text-red-500" />
                <p className="mt-2 font-medium">{overlay.message}</p>
                {overlay.ticketCode && (
                  <p className="mt-1 text-xs text-muted-foreground">Code: {overlay.ticketCode}</p>
                )}
              </div>
              <Button size="lg" className="h-14 text-base" onClick={dismissOverlay}>
                Got it
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="mr-2 h-4 w-4" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
