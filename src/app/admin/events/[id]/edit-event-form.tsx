'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { ImageUpload } from '@/components/image-upload';
import { updateEvent } from './actions';
import type { Event, EventType } from '@/types/database';

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'dinner', label: 'Dinner' },
  { value: 'concert', label: 'Concert' },
  { value: 'movie_night', label: 'Movie Night' },
  { value: 'other', label: 'Other' },
];

function toDatePart(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function toTimePart(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

interface FormData {
  title: string;
  event_type: EventType;
  event_date: string;
  time_start: string;
  time_end: string;
  capacity: string;
  description: string;
  location_name: string;
  location_address: string;
  host_bio: string;
  cover_image_url: string | null;
  gallery_urls: string[];
  social_sharing_enabled: boolean;
}

interface EditEventFormProps {
  event: Event;
}

export function EditEventForm({ event }: EditEventFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    title: event.title,
    event_type: event.event_type,
    event_date: toDatePart(event.date_start),
    time_start: toTimePart(event.date_start),
    time_end: toTimePart(event.date_end),
    capacity: event.capacity?.toString() ?? '',
    description: event.description ?? '',
    location_name: event.location_name ?? '',
    location_address: event.location_address ?? '',
    host_bio: event.host_bio ?? '',
    cover_image_url: event.cover_image_url ?? null,
    gallery_urls: event.gallery_urls ?? [],
    social_sharing_enabled: event.social_sharing_enabled,
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
    if (!formData.event_date) {
      setError('Event date is required');
      return false;
    }
    if (!formData.time_start) {
      setError('Start time is required');
      return false;
    }
    if (!formData.time_end) {
      setError('End time is required');
      return false;
    }
    if (formData.time_end <= formData.time_start) {
      setError('End time must be after start time');
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

    const dateStart = `${formData.event_date}T${formData.time_start}`;
    const dateEnd = `${formData.event_date}T${formData.time_end}`;

    const result = await updateEvent(event.id, {
      title: formData.title.trim(),
      event_type: formData.event_type,
      date_start: dateStart,
      date_end: dateEnd,
      capacity: formData.capacity ? Number(formData.capacity) : null,
      description: formData.description.trim() || null,
      location_name: formData.location_name.trim() || null,
      location_address: formData.location_address.trim() || null,
      host_bio: formData.host_bio.trim() || null,
      cover_image_url: formData.cover_image_url,
      gallery_urls: formData.gallery_urls,
      social_sharing_enabled: formData.social_sharing_enabled,
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
        {event.status === 'published' && (
          <Link
            href={`/e/${event.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline w-fit"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            /e/{event.slug}
          </Link>
        )}
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

          <div className="space-y-2">
            <Label htmlFor="event_date">
              Event Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="event_date"
              type="date"
              value={formData.event_date}
              onChange={(e) => updateField('event_date', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="time_start">
                Start Time <span className="text-destructive">*</span>
              </Label>
              <Input
                id="time_start"
                type="time"
                value={formData.time_start}
                onChange={(e) => updateField('time_start', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time_end">
                End Time <span className="text-destructive">*</span>
              </Label>
              <Input
                id="time_end"
                type="time"
                value={formData.time_end}
                onChange={(e) => updateField('time_end', e.target.value)}
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

          {/* Cover Image */}
          <div className="space-y-2">
            <Label>Cover Image</Label>
            <ImageUpload
              eventId={event.id}
              type="cover"
              currentUrl={formData.cover_image_url}
              onUpload={(url) => updateField('cover_image_url', url)}
              onRemove={() => updateField('cover_image_url', null)}
            />
          </div>

          {/* Gallery */}
          <div className="space-y-2">
            <Label>Gallery</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {formData.gallery_urls.map((url, i) => (
                <ImageUpload
                  key={url}
                  eventId={event.id}
                  type="gallery"
                  currentUrl={url}
                  onUpload={() => {}}
                  onRemove={() => {
                    setFormData((prev) => ({
                      ...prev,
                      gallery_urls: prev.gallery_urls.filter((_, j) => j !== i),
                    }));
                  }}
                />
              ))}
              <ImageUpload
                eventId={event.id}
                type="gallery"
                onUpload={(url) => {
                  setFormData((prev) => ({
                    ...prev,
                    gallery_urls: [...prev.gallery_urls, url],
                  }));
                }}
              />
            </div>
          </div>

          {/* Social Sharing */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="social_sharing_enabled">Enable social share buttons</Label>
              <p className="text-muted-foreground text-sm">
                Show share buttons on the public event page
              </p>
            </div>
            <Switch
              id="social_sharing_enabled"
              checked={formData.social_sharing_enabled}
              onCheckedChange={(checked) => updateField('social_sharing_enabled', checked)}
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
