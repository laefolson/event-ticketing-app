'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/types/actions';
import type { EventType } from '@/types/database';

const createEventSchema = z
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

export type CreateEventInput = {
  title: string;
  event_type: EventType;
  date_start: string;
  date_end: string;
  capacity: number | null;
  description: string | null;
  location_name: string | null;
  location_address: string | null;
  host_bio: string | null;
  publish: boolean;
};

function generateSlug(title: string): string {
  const kebab = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = Math.random().toString(36).substring(2, 8);
  return `${kebab}-${suffix}`;
}

export async function createEvent(
  input: CreateEventInput
): Promise<ActionResponse<{ eventId: string }>> {
  const parsed = createEventSchema.safeParse(input);
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
    return { success: false, error: 'You must be logged in to create an event.' };
  }

  const { publish, ...fields } = parsed.data;
  const slug = generateSlug(fields.title);

  const { data, error } = await supabase
    .from('events')
    .insert({
      ...fields,
      date_start: new Date(fields.date_start).toISOString(),
      date_end: new Date(fields.date_end).toISOString(),
      slug,
      status: publish ? 'published' : 'draft',
      is_published: publish,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return {
        success: false,
        error: 'A slug collision occurred. Please try again.',
      };
    }
    return { success: false, error: error.message };
  }

  return { success: true, data: { eventId: data.id } };
}
