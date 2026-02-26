'use client';

import { useState, useMemo } from 'react';
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
import { ImageUpload } from '@/components/image-upload';
import { cn } from '@/lib/utils';
import { createEvent } from './actions';
import type { EventType } from '@/types/database';

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'dinner', label: 'Dinner' },
  { value: 'concert', label: 'Concert' },
  { value: 'movie_night', label: 'Movie Night' },
  { value: 'other', label: 'Other' },
];

interface FormData {
  title: string;
  event_type: EventType | '';
  date_start: string;
  date_end: string;
  capacity: string;
  description: string;
  location_name: string;
  location_address: string;
  host_bio: string;
  cover_image_url: string | null;
}

const initialFormData: FormData = {
  title: '',
  event_type: '',
  date_start: '',
  date_end: '',
  capacity: '',
  description: '',
  location_name: '',
  location_address: '',
  host_bio: '',
  cover_image_url: null,
};

export default function NewEventPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  // Stable temp ID for image uploads before event is created
  const tempEventId = useMemo(() => crypto.randomUUID(), []);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [submittingAs, setSubmittingAs] = useState<'draft' | 'publish' | null>(null);

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  function handleNext() {
    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }
    if (!formData.event_type) {
      setError('Event type is required');
      return;
    }
    if (!formData.date_start) {
      setError('Start date is required');
      return;
    }
    if (!formData.date_end) {
      setError('End date is required');
      return;
    }
    if (new Date(formData.date_end) <= new Date(formData.date_start)) {
      setError('End date must be after start date');
      return;
    }
    if (formData.capacity && (isNaN(Number(formData.capacity)) || Number(formData.capacity) < 1)) {
      setError('Capacity must be a positive number');
      return;
    }
    setError(null);
    setStep(2);
  }

  async function handleSubmit(publish: boolean) {
    setIsPending(true);
    setSubmittingAs(publish ? 'publish' : 'draft');
    setError(null);

    const result = await createEvent({
      title: formData.title.trim(),
      event_type: formData.event_type as EventType,
      date_start: formData.date_start,
      date_end: formData.date_end,
      capacity: formData.capacity ? Number(formData.capacity) : null,
      description: formData.description.trim() || null,
      location_name: formData.location_name.trim() || null,
      location_address: formData.location_address.trim() || null,
      host_bio: formData.host_bio.trim() || null,
      cover_image_url: formData.cover_image_url,
      publish,
    });

    if (result.success && result.data) {
      router.push(`/admin/events/${result.data.eventId}`);
    } else {
      setError(result.error ?? 'Something went wrong. Please try again.');
      setIsPending(false);
      setSubmittingAs(null);
    }
  }

  const steps = [
    { number: 1, label: 'Basics' },
    { number: 2, label: 'Details' },
  ];

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Create New Event</h1>
        <p className="text-muted-foreground mt-1">
          Fill in the basics, then add details.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-0 mb-8">
        {steps.map((s, i) => (
          <div key={s.number} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                  step >= s.number
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {s.number}
              </div>
              <span
                className={cn(
                  'text-sm font-medium',
                  step >= s.number
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'mx-4 h-px w-16',
                  step > s.number ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{step === 1 ? 'Basics' : 'Details'}</CardTitle>
          <CardDescription>
            {step === 1
              ? 'Event name, type, dates, and capacity.'
              : 'Description, location, and host info.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
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

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={handleNext}>Next</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
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

              <div className="space-y-2">
                <Label htmlFor="location_name">Location Name</Label>
                <Input
                  id="location_name"
                  placeholder="e.g. The Red Barn"
                  value={formData.location_name}
                  onChange={(e) =>
                    updateField('location_name', e.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location_address">Location Address</Label>
                <Input
                  id="location_address"
                  placeholder="e.g. 123 Country Rd, Town, ST 12345"
                  value={formData.location_address}
                  onChange={(e) =>
                    updateField('location_address', e.target.value)
                  }
                />
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

              <div className="space-y-2">
                <Label>Cover Image</Label>
                <ImageUpload
                  eventId={tempEventId}
                  type="cover"
                  currentUrl={formData.cover_image_url}
                  onUpload={(url) => updateField('cover_image_url', url)}
                  onRemove={() => updateField('cover_image_url', null)}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStep(1);
                    setError(null);
                  }}
                  disabled={isPending}
                >
                  Back
                </Button>
                <div className="flex gap-2">
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
                    {submittingAs === 'publish'
                      ? 'Publishing...'
                      : 'Publish'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
