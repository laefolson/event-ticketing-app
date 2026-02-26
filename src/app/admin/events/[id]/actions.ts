'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
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
    cover_image_url: z.string().url().nullable().optional(),
    gallery_urls: z.array(z.string().url()).optional(),
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
  cover_image_url?: string | null;
  gallery_urls?: string[];
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
