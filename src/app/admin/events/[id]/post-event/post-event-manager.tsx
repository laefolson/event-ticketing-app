'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Clock,
  Mail,
  MessageSquare,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  getThankYouPreview,
  sendThankYouMessages,
  archiveEvent,
  unarchiveEvent,
} from './actions';
import type { RecipientPreview, SendResult } from './actions';

interface PostEventManagerProps {
  event: {
    id: string;
    title: string;
    date_end: string;
    status: string;
    link_active: boolean;
    archived_at: string | null;
  };
  eligibleTicketCount: number;
  thankYouAlreadySent: boolean;
}

export function PostEventManager({
  event,
  eligibleTicketCount,
  thankYouAlreadySent,
}: PostEventManagerProps) {
  const router = useRouter();
  const eventEnded = new Date(event.date_end) <= new Date();

  // Thank-you state
  const [emailBody, setEmailBody] = useState(
    `Thank you for joining us at ${event.title}! We truly appreciate your presence and hope you had a wonderful time.\n\nWe look forward to seeing you at our next event!`
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<RecipientPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Send state
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [sendResultOpen, setSendResultOpen] = useState(false);

  // Archive state
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const smsPreview = `Thank you for attending ${event.title}! Hope to see you next time.`;

  // ── Preview & Send ────────────────────────────────────────────────

  async function handlePreview() {
    setPreviewError(null);
    setPreviewLoading(true);
    setPreviewOpen(true);

    const result = await getThankYouPreview(event.id);

    setPreviewLoading(false);

    if (!result.success) {
      setPreviewError(result.error ?? 'Failed to load preview.');
      return;
    }

    setPreview(result.data!);
  }

  async function handleSend() {
    setSending(true);

    const result = await sendThankYouMessages({
      eventId: event.id,
      emailBody,
      force: thankYouAlreadySent || (preview?.alreadySent ?? false),
    });

    setSending(false);
    setPreviewOpen(false);

    if (!result.success) {
      setPreviewError(result.error ?? 'Failed to send messages.');
      return;
    }

    setSendResult(result.data!);
    setSendResultOpen(true);
  }

  function closeSendResult() {
    setSendResultOpen(false);
    router.refresh();
  }

  // ── Archive ───────────────────────────────────────────────────────

  async function handleArchive() {
    setArchiving(true);
    setArchiveError(null);

    const result = await archiveEvent(event.id);

    setArchiving(false);
    setArchiveDialogOpen(false);

    if (!result.success) {
      setArchiveError(result.error ?? 'Failed to archive event.');
      return;
    }

    router.refresh();
  }

  async function handleUnarchive() {
    setArchiving(true);
    setArchiveError(null);

    const result = await unarchiveEvent(event.id);

    setArchiving(false);

    if (!result.success) {
      setArchiveError(result.error ?? 'Failed to unarchive event.');
      return;
    }

    router.refresh();
  }

  // ── Event hasn't ended ────────────────────────────────────────────

  if (!eventEnded) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              Event Has Not Ended Yet
            </h3>
            <p className="text-muted-foreground">
              Ends on{' '}
              {format(new Date(event.date_end), 'EEEE, MMMM d, yyyy \'at\' h:mm a')}
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              ({formatDistanceToNow(new Date(event.date_end), { addSuffix: true })})
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Event has ended ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Thank-You Messages Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Thank-You Messages
          </CardTitle>
          <CardDescription>
            Send thank-you messages to {eligibleTicketCount} confirmed/checked-in
            attendee{eligibleTicketCount !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Already sent warning */}
          {thankYouAlreadySent && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Thank-you messages have already been sent for this event. You can
                still send again if needed.
              </p>
            </div>
          )}

          {/* Zero attendees info */}
          {eligibleTicketCount === 0 && (
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No confirmed or checked-in attendees to send thank-you messages
                to.
              </p>
            </div>
          )}

          {/* Email body */}
          <div className="space-y-2">
            <Label htmlFor="email-body">Email message</Label>
            <Textarea
              id="email-body"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Write your thank-you email message..."
            />
            <p className="text-xs text-muted-foreground">
              {emailBody.length}/5000 characters
            </p>
          </div>

          {/* SMS preview */}
          <div className="space-y-2">
            <Label>SMS message (fixed template)</Label>
            <div className="flex items-start gap-2 rounded-md border bg-muted/50 p-3">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{smsPreview}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handlePreview}
              disabled={
                eligibleTicketCount === 0 || !emailBody.trim()
              }
            >
              Preview & Send
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Archive Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Archive Event
          </CardTitle>
          <CardDescription>
            Archiving disables the public event page. This action is reversible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {archiveError && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
              {archiveError}
            </div>
          )}

          {event.status === 'archived' ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Archived on{' '}
                {event.archived_at
                  ? format(new Date(event.archived_at), 'MMMM d, yyyy')
                  : 'an unknown date'}
              </p>
              <Button
                variant="outline"
                onClick={handleUnarchive}
                disabled={archiving}
              >
                <ArchiveRestore className="mr-2 h-4 w-4" />
                {archiving ? 'Restoring...' : 'Unarchive Event'}
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button
                variant="destructive"
                onClick={() => setArchiveDialogOpen(true)}
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive Event
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Thank-You Messages</DialogTitle>
            <DialogDescription>
              Review recipients before sending.
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                Loading recipients...
              </p>
            </div>
          ) : previewError ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
              {previewError}
            </div>
          ) : preview ? (
            <div className="space-y-4">
              {/* Stats */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  <Mail className="mr-1 h-3 w-3" />
                  {preview.emailCount} email
                </Badge>
                <Badge variant="secondary">
                  <MessageSquare className="mr-1 h-3 w-3" />
                  {preview.smsCount} SMS
                </Badge>
                <Badge variant="outline">
                  {preview.emailCount + preview.smsCount} total
                </Badge>
              </div>

              {/* Re-send warning */}
              {preview.alreadySent && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Messages have already been sent. Sending again will deliver
                    duplicate messages to recipients.
                  </p>
                </div>
              )}

              {/* Recipient list */}
              <div className="max-h-60 overflow-y-auto rounded-md border">
                <div className="divide-y">
                  {preview.recipients.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{r.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">
                          {r.channel === 'email' ? r.email : r.phone}
                        </span>
                        <Badge
                          variant={
                            r.channel === 'email' ? 'default' : 'secondary'
                          }
                          className="text-xs"
                        >
                          {r.channel === 'email' ? 'Email' : 'SMS'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={
                sending || previewLoading || !!previewError || !preview
              }
            >
              {sending
                ? 'Sending...'
                : preview?.alreadySent
                  ? 'Send Again'
                  : 'Send Messages'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Event</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive this event?
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Archiving will disable the public event page so new visitors can no
            longer view or purchase tickets. This action can be reversed.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveDialogOpen(false)}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={archiving}
            >
              {archiving ? 'Archiving...' : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Result Dialog */}
      <Dialog open={sendResultOpen} onOpenChange={(open) => {
        if (!open) closeSendResult();
        else setSendResultOpen(true);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Messages Sent</DialogTitle>
            <DialogDescription>
              Thank-you messages have been processed.
            </DialogDescription>
          </DialogHeader>

          {sendResult && (
            <div className="space-y-4">
              {/* Success banner */}
              <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Successfully sent {sendResult.sent} message
                  {sendResult.sent !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Failures */}
              {sendResult.failed > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    {sendResult.failed} failed:
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-md border border-red-200 p-3 text-xs dark:border-red-800">
                    {sendResult.failedDetails.map((detail, i) => (
                      <div
                        key={i}
                        className="py-0.5 text-red-700 dark:text-red-300"
                      >
                        {detail}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={closeSendResult}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
