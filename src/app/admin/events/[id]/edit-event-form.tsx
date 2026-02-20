'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { updateEvent } from './actions';
import type { Event, EventType } from '@/types/database';

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'dinner', label: 'Dinner' },
  { value: 'concert', label: 'Concert' },
  { value: 'movie_night', label: 'Movie Night' },
  { value: 'other', label: 'Other' },
];

function toDatetimeLocal(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
}

interface FormData {
  title: string;
  event_type: EventType;
  date_start: string;
  date_end: string;
  capacity: string;
  description: string;
  location_name: string;
  location_address: string;
  host_bio: string;
}

interface EditEventFormProps {
  event: Event;
}

export function EditEventForm({ event }: EditEventFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    title: event.title,
    event_type: event.event_type,
    date_start: toDatetimeLocal(event.date_start),
    date_end: toDatetimeLocal(event.date_end),
    capacity: event.capacity?.toString() ?? '',
    description: event.description ?? '',
    location_name: event.location_name ?? '',
    location_address: event.location_address ?? '',
    host_bio: event.host_bio ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [submittingAs, setSubmittingAs] = useState<'draft' | 'publish' | null>(null);

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  function validate(): boolean {
    if (!formData.title.trim()) {
      setError('Title is required');
      return false;
    }
    if (!formData.event_type) {
      setError('Event type is required');
      return false;
    }
    if (!formData.date_start) {
      setError('Start date is required');
      return false;
    }
    if (!formData.date_end) {
      setError('End date is required');
      return false;
    }
    if (new Date(formData.date_end) <= new Date(formData.date_start)) {
      setError('End date must be after start date');
      return false;
    }
    if (formData.capacity && (isNaN(Number(formData.capacity)) || Number(formData.capacity) < 1)) {
      setError('Capacity must be a positive number');
      return false;
    }
    return true;
  }

  async function handleSubmit(publish: boolean) {
    if (!validate()) return;

    setIsPending(true);
    setSubmittingAs(publish ? 'publish' : 'draft');
    setError(null);

    const result = await updateEvent(event.id, {
      title: formData.title.trim(),
      event_type: formData.event_type,
      date_start: formData.date_start,
      date_end: formData.date_end,
      capacity: formData.capacity ? Number(formData.capacity) : null,
      description: formData.description.trim() || null,
      location_name: formData.location_name.trim() || null,
      location_address: formData.location_address.trim() || null,
      host_bio: formData.host_bio.trim() || null,
      publish,
    });

    if (result.success) {
      router.refresh();
    } else {
      setError(result.error ?? 'Something went wrong. Please try again.');
    }

    setIsPending(false);
    setSubmittingAs(null);
  }

  const isDraft = event.status === 'draft';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event Details</CardTitle>
        <CardDescription>
          Update the event information below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="e.g. Summer Barn Dinner"
              value={formData.title}
              onChange={(e) => updateField('title', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event_type">
              Event Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.event_type}
              onValueChange={(value) =>
                updateField('event_type', value as EventType)
              }
            >
              <SelectTrigger id="event_type">
                <SelectValue placeholder="Select event type" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date_start">
                Start Date & Time <span className="text-destructive">*</span>
              </Label>
              <Input
                id="date_start"
                type="datetime-local"
                value={formData.date_start}
                onChange={(e) => updateField('date_start', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date_end">
                End Date & Time <span className="text-destructive">*</span>
              </Label>
              <Input
                id="date_end"
                type="datetime-local"
                value={formData.date_end}
                onChange={(e) => updateField('date_end', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity</Label>
            <Input
              id="capacity"
              type="number"
              min="1"
              placeholder="Leave blank for unlimited"
              value={formData.capacity}
              onChange={(e) => updateField('capacity', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Tell guests what to expect..."
              rows={4}
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location_name">Location Name</Label>
              <Input
                id="location_name"
                placeholder="e.g. The Red Barn"
                value={formData.location_name}
                onChange={(e) => updateField('location_name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location_address">Location Address</Label>
              <Input
                id="location_address"
                placeholder="e.g. 123 Country Rd, Town, ST 12345"
                value={formData.location_address}
                onChange={(e) => updateField('location_address', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="host_bio">Host Bio</Label>
            <Textarea
              id="host_bio"
              placeholder="A short bio about the host..."
              rows={3}
              value={formData.host_bio}
              onChange={(e) => updateField('host_bio', e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {isDraft ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSubmit(false)}
                  disabled={isPending}
                >
                  {submittingAs === 'draft' ? 'Saving...' : 'Save as Draft'}
                </Button>
                <Button
                  onClick={() => handleSubmit(true)}
                  disabled={isPending}
                >
                  {submittingAs === 'publish' ? 'Publishing...' : 'Publish'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSubmit(false)}
                  disabled={isPending}
                >
                  {submittingAs === 'draft' ? 'Unpublishing...' : 'Unpublish'}
                </Button>
                <Button
                  onClick={() => handleSubmit(true)}
                  disabled={isPending}
                >
                  {submittingAs === 'publish' ? 'Saving...' : 'Save'}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
