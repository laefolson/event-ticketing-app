'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { deleteEvent } from './actions';

interface DeleteEventButtonProps {
  eventId: string;
  eventTitle: string;
}

export function DeleteEventButton({ eventId, eventTitle }: DeleteEventButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmation === eventTitle;

  async function handleDelete() {
    setLoading(true);
    setError(null);

    const result = await deleteEvent(eventId);

    if (result.success) {
      router.push('/admin/archive');
    } else {
      setError(result.error ?? 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Delete Event
      </Button>

      <Dialog open={open} onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setConfirmation('');
          setError(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
            <DialogDescription>
              This will permanently delete the event and all associated data
              including tickets, contacts, and invitation history. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Type <span className="font-semibold text-foreground">{eventTitle}</span> to
              confirm.
            </p>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="Event title"
              disabled={loading}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!confirmed || loading}
            >
              {loading ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
