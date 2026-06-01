'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImageUpload } from '@/components/image-upload';
import { updateEventNotifications } from './actions';
import type { Event } from '@/types/database';

interface FormState {
  save_the_date_image_url: string | null;
  save_the_date_intro_text: string;
  save_the_date_text: string;
  save_the_date_sms_body: string;
  invitation_intro_text: string;
  invitation_image_url: string | null;
  invitation_after_image_text: string;
  invitation_sms_body: string;
}

export function NotificationsForm({ event }: { event: Event }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    save_the_date_image_url: event.save_the_date_image_url ?? null,
    save_the_date_intro_text: event.save_the_date_intro_text ?? '',
    save_the_date_text: event.save_the_date_text ?? '',
    save_the_date_sms_body: event.save_the_date_sms_body ?? '',
    invitation_intro_text: event.invitation_intro_text ?? '',
    invitation_image_url: event.invitation_image_url ?? null,
    invitation_after_image_text: event.invitation_after_image_text ?? '',
    invitation_sms_body: event.invitation_sms_body ?? '',
  });
  const [saving, setSaving] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateEventNotifications(event.id, {
      save_the_date_image_url: form.save_the_date_image_url,
      save_the_date_intro_text: form.save_the_date_intro_text.trim() || null,
      save_the_date_text: form.save_the_date_text.trim() || null,
      save_the_date_sms_body: form.save_the_date_sms_body.trim() || null,
      invitation_intro_text: form.invitation_intro_text.trim() || null,
      invitation_image_url: form.invitation_image_url,
      invitation_after_image_text: form.invitation_after_image_text.trim() || null,
      invitation_sms_body: form.invitation_sms_body.trim() || null,
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to save.');
      return;
    }
    toast.success('Notification settings saved.');
    router.refresh();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Save the Date</CardTitle>
          <CardDescription>
            What goes out when you send save-the-dates. Leave a field blank to use the default copy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="std-intro">Intro text (after the greeting)</Label>
            <Textarea
              id="std-intro"
              rows={3}
              placeholder={`Default: "Mark your calendar for ${event.title}. More details coming soon!"`}
              value={form.save_the_date_intro_text}
              onChange={(e) => update('save_the_date_intro_text', e.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="space-y-2">
            <Label>Marketing image</Label>
            <ImageUpload
              eventId={event.id}
              type="cover"
              currentUrl={form.save_the_date_image_url}
              onUpload={(url) => update('save_the_date_image_url', url)}
              onRemove={() => update('save_the_date_image_url', null)}
              contain
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="std-after">Text after the image</Label>
            <Textarea
              id="std-after"
              rows={3}
              placeholder="Add any extra details to appear below the image..."
              value={form.save_the_date_text}
              onChange={(e) => update('save_the_date_text', e.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="std-sms">SMS body</Label>
            <Textarea
              id="std-sms"
              rows={2}
              placeholder={`Default: "Save the date! ${event.title} on <date>. More details coming soon."`}
              value={form.save_the_date_sms_body}
              onChange={(e) => update('save_the_date_sms_body', e.target.value)}
              maxLength={1200}
            />
            <p className="text-muted-foreground text-xs">
              Keep it under ~160 characters to fit a single SMS segment.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitation</CardTitle>
          <CardDescription>
            What goes out when you send invitations. The button label is set automatically: &ldquo;RSVP&rdquo; for free events, &ldquo;View Event &amp; Purchase Tickets&rdquo; otherwise.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inv-intro">Intro text (after the greeting)</Label>
            <Textarea
              id="inv-intro"
              rows={3}
              placeholder={`Default: "We'd love for you to join us at ${event.title}."`}
              value={form.invitation_intro_text}
              onChange={(e) => update('invitation_intro_text', e.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="space-y-2">
            <Label>Marketing image</Label>
            <ImageUpload
              eventId={event.id}
              type="cover"
              currentUrl={form.invitation_image_url}
              onUpload={(url) => update('invitation_image_url', url)}
              onRemove={() => update('invitation_image_url', null)}
              contain
            />
            <p className="text-muted-foreground text-xs">
              Falls back to the event cover image if nothing is uploaded here.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inv-after">Text below the image</Label>
            <Textarea
              id="inv-after"
              rows={3}
              placeholder="Optional copy to appear between the image and the button."
              value={form.invitation_after_image_text}
              onChange={(e) => update('invitation_after_image_text', e.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inv-sms">SMS body</Label>
            <Textarea
              id="inv-sms"
              rows={2}
              placeholder={`Default: "You're invited to ${event.title} on <date>! View details:"`}
              value={form.invitation_sms_body}
              onChange={(e) => update('invitation_sms_body', e.target.value)}
              maxLength={1200}
            />
            <p className="text-muted-foreground text-xs">
              The event URL is appended automatically.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
