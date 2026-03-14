'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResponse } from '@/types/actions';
import type { EventType } from '@/types/database';

const updateEventSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(200),
    event_type: z.enum(['dinner', 'concert', 'movie_night', 'other'], {
      error: 'Event type is required',
    }),
    date_start: z.string().min(1, 'Start date is required'),
    date_end: z.string().min(1, 'End date is required'),
    capacity: z
      .number()
      .int()
      .positive('Capacity must be a positive number')
      .nullable(),
    description: z.string().max(5000).nullable(),
    location_name: z.string().max(200).nullable(),
    location_address: z.string().max(500).nullable(),
    host_bio: z.string().max(2000).nullable(),
    host_bio_headline: z.string().max(200).nullable(),
    cover_image_url: z.string().url().nullable().optional(),
    gallery_urls: z.array(z.string().url()).optional(),
    save_the_date_image_url: z.string().url().nullable().optional(),
    save_the_date_text: z.string().max(2000).nullable().optional(),
    social_sharing_enabled: z.boolean(),
    publish: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.date_start);
    const end = new Date(data.date_end);
    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be after start date',
        path: ['date_end'],
      });
    }
  });

export type UpdateEventInput = {
  title: string;
  event_type: EventType;
  date_start: string;
  date_end: string;
  capacity: number | null;
  description: string | null;
  location_name: string | null;
  location_address: string | null;
  host_bio: string | null;
  host_bio_headline: string | null;
  cover_image_url?: string | null;
  gallery_urls?: string[];
  save_the_date_image_url?: string | null;
  save_the_date_text?: string | null;
  social_sharing_enabled: boolean;
  publish: boolean;
};

export async function updateEvent(
  eventId: string,
  input: UpdateEventInput
): Promise<ActionResponse<{ eventId: string }>> {
  const parsed = updateEventSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { success: false, error: firstError.message };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in to update an event.' };
  }

  const { publish, ...fields } = parsed.data;

  const { error } = await supabase
    .from('events')
    .update({
      ...fields,
      date_start: new Date(fields.date_start).toISOString(),
      date_end: new Date(fields.date_end).toISOString(),
      status: publish ? 'published' : 'draft',
      is_published: publish,
    })
    .eq('id', eventId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: { eventId } };
}

export async function deleteEvent(eventId: string): Promise<ActionResponse> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  // Verify event exists
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .single();

  if (fetchError || !event) {
    return { success: false, error: 'Event not found.' };
  }

  // Delete tickets first — ticket_tiers has ON DELETE RESTRICT from tickets
  const { error: ticketsError } = await supabase
    .from('tickets')
    .delete()
    .eq('event_id', eventId);

  if (ticketsError) {
    return { success: false, error: 'Failed to delete tickets: ' + ticketsError.message };
  }

  // Clean up storage: remove all files under event-assets/{eventId}/
  const adminClient = createAdminClient();
  const { data: files } = await adminClient.storage
    .from('event-assets')
    .list(eventId);

  if (files && files.length > 0) {
    const filePaths = files.map((f) => `${eventId}/${f.name}`);
    await adminClient.storage.from('event-assets').remove(filePaths);
  }

  // Delete the event — CASCADE handles tiers, contacts, csv_imports, invitation_logs
  const { error: deleteError } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (deleteError) {
    return { success: false, error: 'Failed to delete event: ' + deleteError.message };
  }

  return { success: true };
}
