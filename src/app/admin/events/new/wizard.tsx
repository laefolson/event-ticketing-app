'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { createEvent, createTiersForEvent } from './actions';
import type { EventType } from '@/types/database';

// --- Types ---

interface TierFormData {
  id: string; // local key only
  name: string;
  price: string;
  quantity_total: string;
  max_per_contact: string;
  description: string;
  sort_order: number;
}

interface FaqPair {
  id: string;
  question: string;
  answer: string;
}

interface FormData {
  title: string;
  event_type: EventType | '';
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
  tiers: TierFormData[];
  faq: FaqPair[];
}

// --- Constants ---

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'dinner', label: 'Dinner' },
  { value: 'concert', label: 'Concert' },
  { value: 'movie_night', label: 'Movie Night' },
  { value: 'other', label: 'Other' },
];

const STEPS = [
  { number: 1, label: 'Basics' },
  { number: 2, label: 'Details' },
  { number: 3, label: 'Tiers' },
  { number: 4, label: 'FAQ' },
  { number: 5, label: 'Review' },
];

const MAX_GALLERY_IMAGES = 6;

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatEventType(type: string): string {
  return EVENT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

// --- Component ---

interface NewEventWizardProps {
  defaultHostBio: string | null;
}

export function NewEventWizard({ defaultHostBio }: NewEventWizardProps) {
  const router = useRouter();
  const tempEventId = useMemo(() => crypto.randomUUID(), []);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    event_type: '',
    event_date: '',
    time_start: '',
    time_end: '',
    capacity: '',
    description: '',
    location_name: '',
    location_address: '',
    host_bio: defaultHostBio ?? '',
    cover_image_url: null,
    gallery_urls: [],
    tiers: [],
    faq: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [submittingAs, setSubmittingAs] = useState<'draft' | 'publish' | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  // Tier inline editing
  const [editingTierIdx, setEditingTierIdx] = useState<number | null>(null);
  const [tierForm, setTierForm] = useState(emptyTierForm());

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  // --- Step validation ---

  function validateStep1(): boolean {
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

  function validateStep3(): boolean {
    if (formData.tiers.length === 0) {
      setError('At least one ticket tier is required');
      return false;
    }
    return true;
  }

  function validateStep4(): boolean {
    for (let i = 0; i < formData.faq.length; i++) {
      const pair = formData.faq[i];
      if (!pair.question.trim() || !pair.answer.trim()) {
        setError(`FAQ #${i + 1}: Both question and answer are required`);
        return false;
      }
    }
    return true;
  }

  function handleNext() {
    setError(null);
    if (step === 1 && !validateStep1()) return;
    if (step === 3 && !validateStep3()) return;
    if (step === 4 && !validateStep4()) return;
    setStep((s) => Math.min(s + 1, 5));
  }

  function handleBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  }

  // --- Tier helpers ---

  function emptyTierForm(): Omit<TierFormData, 'id' | 'sort_order'> {
    return { name: '', price: '', quantity_total: '', max_per_contact: '', description: '' };
  }

  function openAddTier() {
    setEditingTierIdx(-1); // -1 = new tier
    setTierForm(emptyTierForm());
    setError(null);
  }

  function openEditTier(idx: number) {
    const t = formData.tiers[idx];
    setEditingTierIdx(idx);
    setTierForm({
      name: t.name,
      price: t.price,
      quantity_total: t.quantity_total,
      max_per_contact: t.max_per_contact,
      description: t.description,
    });
    setError(null);
  }

  function saveTier() {
    if (!tierForm.name.trim()) {
      setError('Tier name is required');
      return;
    }
    const priceDollars = parseFloat(tierForm.price || '0');
    if (isNaN(priceDollars) || priceDollars < 0) {
      setError('Price must be a valid number >= 0');
      return;
    }
    const qty = parseInt(tierForm.quantity_total, 10);
    if (!qty || qty < 1) {
      setError('Quantity must be at least 1');
      return;
    }

    setError(null);

    if (editingTierIdx === -1) {
      // Adding new
      const newTier: TierFormData = {
        id: crypto.randomUUID(),
        ...tierForm,
        sort_order: formData.tiers.length,
      };
      updateField('tiers', [...formData.tiers, newTier]);
    } else if (editingTierIdx !== null) {
      // Editing existing
      const updated = formData.tiers.map((t, i) =>
        i === editingTierIdx ? { ...t, ...tierForm } : t
      );
      updateField('tiers', updated);
    }
    setEditingTierIdx(null);
  }

  function cancelTierEdit() {
    setEditingTierIdx(null);
    setError(null);
  }

  function removeTier(idx: number) {
    const updated = formData.tiers.filter((_, i) => i !== idx).map((t, i) => ({ ...t, sort_order: i }));
    updateField('tiers', updated);
  }

  // --- FAQ helpers ---

  function addFaqPair() {
    updateField('faq', [...formData.faq, { id: crypto.randomUUID(), question: '', answer: '' }]);
  }

  function updateFaq(idx: number, field: 'question' | 'answer', value: string) {
    const updated = formData.faq.map((p, i) => (i === idx ? { ...p, [field]: value } : p));
    updateField('faq', updated);
  }

  function removeFaq(idx: number) {
    updateField('faq', formData.faq.filter((_, i) => i !== idx));
  }

  function moveFaq(idx: number, direction: 'up' | 'down') {
    const arr = [...formData.faq];
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    updateField('faq', arr);
  }

  // --- Gallery helpers ---

  function addGalleryImage(url: string) {
    if (formData.gallery_urls.length >= MAX_GALLERY_IMAGES) return;
    updateField('gallery_urls', [...formData.gallery_urls, url]);
  }

  function removeGalleryImage(idx: number) {
    updateField('gallery_urls', formData.gallery_urls.filter((_, i) => i !== idx));
  }

  // --- Submit ---

  async function handleSubmit(publish: boolean) {
    setIsPending(true);
    setSubmittingAs(publish ? 'publish' : 'draft');
    setError(null);

    const dateStart = `${formData.event_date}T${formData.time_start}`;
    const dateEnd = `${formData.event_date}T${formData.time_end}`;

    const eventResult = await createEvent({
      title: formData.title.trim(),
      event_type: formData.event_type as EventType,
      date_start: dateStart,
      date_end: dateEnd,
      capacity: formData.capacity ? Number(formData.capacity) : null,
      description: formData.description.trim() || null,
      location_name: formData.location_name.trim() || null,
      location_address: formData.location_address.trim() || null,
      host_bio: formData.host_bio.trim() || null,
      cover_image_url: formData.cover_image_url,
      gallery_urls: formData.gallery_urls.length > 0 ? formData.gallery_urls : undefined,
      faq: formData.faq.length > 0
        ? formData.faq.map((p) => ({ question: p.question.trim(), answer: p.answer.trim() }))
        : undefined,
      publish,
    });

    if (!eventResult.success || !eventResult.data) {
      setError(eventResult.error ?? 'Something went wrong. Please try again.');
      setIsPending(false);
      setSubmittingAs(null);
      return;
    }

    const eventId = eventResult.data.eventId;

    // Create tiers
    if (formData.tiers.length > 0) {
      const tierInputs = formData.tiers.map((t) => ({
        name: t.name.trim(),
        description: t.description.trim() || null,
        price_cents: Math.round(parseFloat(t.price || '0') * 100),
        quantity_total: parseInt(t.quantity_total, 10),
        max_per_contact: t.max_per_contact ? parseInt(t.max_per_contact, 10) : null,
        sort_order: t.sort_order,
      }));

      const tiersResult = await createTiersForEvent(eventId, tierInputs);
      if (!tiersResult.success) {
        // Event was created but some tiers failed — still redirect, show warning
        console.error('Some tiers failed to create:', tiersResult.error);
      }
    }

    router.push(`/admin/events/${eventId}`);
  }

  // --- Step descriptions ---

  const stepTitles: Record<number, { title: string; desc: string }> = {
    1: { title: 'Basics', desc: 'Event name, type, dates, and capacity.' },
    2: { title: 'Details', desc: 'Description, location, images, and host info.' },
    3: { title: 'Ticket Tiers', desc: 'Set up your ticket options and pricing.' },
    4: { title: 'FAQ', desc: 'Add frequently asked questions (optional).' },
    5: { title: 'Review & Publish', desc: 'Review everything before saving.' },
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Create New Event</h1>
          <p className="text-muted-foreground mt-1">
            Fill in the details step by step.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCancelDialogOpen(true)}
          disabled={isPending}
        >
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-0 mb-8">
        {STEPS.map((s, i) => (
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
                  'text-sm font-medium hidden sm:inline',
                  step >= s.number
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'mx-3 h-px w-8 sm:mx-4 sm:w-12',
                  step > s.number ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{stepTitles[step].title}</CardTitle>
          <CardDescription>{stepTitles[step].desc}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Step 1: Basics */}
          {step === 1 && (
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
                  onValueChange={(value) => updateField('event_type', value as EventType)}
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

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end pt-2">
                <Button onClick={handleNext}>Next</Button>
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {step === 2 && (
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

              <div className="space-y-2">
                <Label>Gallery Images (up to {MAX_GALLERY_IMAGES})</Label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {formData.gallery_urls.map((url, idx) => (
                    <div key={idx} className="relative overflow-hidden rounded-lg border">
                      <div className="relative aspect-[4/3]">
                        <Image src={url} alt={`Gallery ${idx + 1}`} fill className="object-cover" />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeGalleryImage(idx)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {formData.gallery_urls.length < MAX_GALLERY_IMAGES && (
                    <ImageUpload
                      eventId={tempEventId}
                      type="gallery"
                      onUpload={addGalleryImage}
                    />
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={handleBack}>Back</Button>
                <Button onClick={handleNext}>Next</Button>
              </div>
            </div>
          )}

          {/* Step 3: Tiers */}
          {step === 3 && (
            <div className="space-y-4">
              {formData.tiers.length === 0 && editingTierIdx === null && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No tiers yet. Add at least one ticket tier.
                </p>
              )}

              {formData.tiers.map((tier, idx) => (
                <Card key={tier.id}>
                  <CardContent className="flex items-start justify-between gap-4 pt-6">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-baseline gap-3">
                        <span className="font-semibold">{tier.name}</span>
                        <span className="text-muted-foreground text-sm font-medium">
                          {formatPrice(Math.round(parseFloat(tier.price || '0') * 100))}
                        </span>
                      </div>
                      {tier.description && (
                        <p className="text-muted-foreground text-sm">{tier.description}</p>
                      )}
                      <p className="text-muted-foreground text-sm">
                        Qty: {tier.quantity_total}
                        {tier.max_per_contact && <> &middot; Max {tier.max_per_contact} per person</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditTier(idx)} disabled={editingTierIdx !== null}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => removeTier(idx)} disabled={editingTierIdx !== null}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Inline tier form */}
              {editingTierIdx !== null && (
                <Card className="border-primary">
                  <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="tier-name">Name <span className="text-destructive">*</span></Label>
                      <Input
                        id="tier-name"
                        value={tierForm.name}
                        onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
                        placeholder="e.g. General Admission"
                        maxLength={200}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tier-price">Price ($)</Label>
                      <Input
                        id="tier-price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={tierForm.price}
                        onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })}
                        placeholder="0.00 (free)"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tier-qty">Quantity <span className="text-destructive">*</span></Label>
                      <Input
                        id="tier-qty"
                        type="number"
                        min="1"
                        step="1"
                        value={tierForm.quantity_total}
                        onChange={(e) => setTierForm({ ...tierForm, quantity_total: e.target.value })}
                        placeholder="e.g. 50"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tier-max">Max per person</Label>
                      <Input
                        id="tier-max"
                        type="number"
                        min="1"
                        step="1"
                        value={tierForm.max_per_contact}
                        onChange={(e) => setTierForm({ ...tierForm, max_per_contact: e.target.value })}
                        placeholder="No limit"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tier-desc">Description</Label>
                      <Textarea
                        id="tier-desc"
                        value={tierForm.description}
                        onChange={(e) => setTierForm({ ...tierForm, description: e.target.value })}
                        placeholder="Optional description"
                        maxLength={1000}
                        rows={2}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={cancelTierEdit}>Cancel</Button>
                      <Button size="sm" onClick={saveTier}>
                        {editingTierIdx === -1 ? 'Add Tier' : 'Save Changes'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {editingTierIdx === null && (
                <Button variant="outline" onClick={openAddTier} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Tier
                </Button>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={handleBack}>Back</Button>
                <Button onClick={handleNext} disabled={editingTierIdx !== null}>Next</Button>
              </div>
            </div>
          )}

          {/* Step 4: FAQ */}
          {step === 4 && (
            <div className="space-y-4">
              {formData.faq.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No FAQ yet. This step is optional.
                </p>
              )}

              {formData.faq.map((pair, idx) => (
                <Card key={pair.id}>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">
                        Question {idx + 1}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveFaq(idx, 'up')}
                          disabled={idx === 0}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => moveFaq(idx, 'down')}
                          disabled={idx === formData.faq.length - 1}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeFaq(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Input
                      placeholder="Question"
                      value={pair.question}
                      onChange={(e) => updateFaq(idx, 'question', e.target.value)}
                      maxLength={500}
                    />
                    <Textarea
                      placeholder="Answer"
                      rows={2}
                      value={pair.answer}
                      onChange={(e) => updateFaq(idx, 'answer', e.target.value)}
                      maxLength={2000}
                    />
                  </CardContent>
                </Card>
              ))}

              <Button variant="outline" onClick={addFaqPair} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Question
              </Button>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={handleBack}>Back</Button>
                <Button onClick={handleNext}>Next</Button>
              </div>
            </div>
          )}

          {/* Step 5: Review & Publish */}
          {step === 5 && (
            <div className="space-y-6">
              {/* Basics summary */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">Basics</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Title</span>
                  <span>{formData.title}</span>
                  <span className="text-muted-foreground">Type</span>
                  <span>{formatEventType(formData.event_type)}</span>
                  <span className="text-muted-foreground">Date</span>
                  <span>{formData.event_date ? new Date(formData.event_date + 'T00:00').toLocaleDateString() : '—'}</span>
                  <span className="text-muted-foreground">Time</span>
                  <span>{formData.time_start && formData.time_end ? `${formData.time_start} – ${formData.time_end}` : '—'}</span>
                  <span className="text-muted-foreground">Capacity</span>
                  <span>{formData.capacity || 'Unlimited'}</span>
                </div>
              </div>

              {/* Details summary */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">Details</h3>
                <div className="text-sm space-y-1">
                  {formData.description && (
                    <p className="text-muted-foreground">
                      {formData.description.length > 150
                        ? formData.description.slice(0, 150) + '...'
                        : formData.description}
                    </p>
                  )}
                  {formData.location_name && (
                    <p><span className="text-muted-foreground">Location:</span> {formData.location_name}</p>
                  )}
                  {formData.cover_image_url && (
                    <div className="relative h-32 w-48 overflow-hidden rounded-md border">
                      <Image src={formData.cover_image_url} alt="Cover" fill className="object-cover" />
                    </div>
                  )}
                  {formData.gallery_urls.length > 0 && (
                    <p className="text-muted-foreground">{formData.gallery_urls.length} gallery image(s)</p>
                  )}
                  {formData.host_bio && (
                    <p>
                      <span className="text-muted-foreground">Host bio:</span>{' '}
                      {formData.host_bio.length > 100
                        ? formData.host_bio.slice(0, 100) + '...'
                        : formData.host_bio}
                    </p>
                  )}
                </div>
              </div>

              {/* Tiers summary */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">
                  Ticket Tiers ({formData.tiers.length})
                </h3>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Name</th>
                        <th className="text-right px-3 py-2 font-medium">Price</th>
                        <th className="text-right px-3 py-2 font-medium">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.tiers.map((tier) => (
                        <tr key={tier.id} className="border-t">
                          <td className="px-3 py-2">{tier.name}</td>
                          <td className="px-3 py-2 text-right">
                            {formatPrice(Math.round(parseFloat(tier.price || '0') * 100))}
                          </td>
                          <td className="px-3 py-2 text-right">{tier.quantity_total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* FAQ summary */}
              {formData.faq.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">
                    FAQ ({formData.faq.length})
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {formData.faq.map((pair, idx) => (
                      <li key={pair.id} className="text-muted-foreground">
                        {idx + 1}. {pair.question}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={handleBack} disabled={isPending}>
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
                    {submittingAs === 'publish' ? 'Publishing...' : 'Publish'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel event creation?</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel? All progress will be lost and you&apos;ll
              return to the events list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Continue editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => router.push('/admin/events')}
            >
              Discard & exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
