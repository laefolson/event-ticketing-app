'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/types/actions';

const notificationsSchema = z.object({
  save_the_date_image_url: z.string().url().nullable(),
  save_the_date_intro_text: z.string().max(2000).nullable(),
  save_the_date_text: z.string().max(2000).nullable(),
  save_the_date_sms_body: z.string().max(1200).nullable(),
  invitation_intro_text: z.string().max(2000).nullable(),
  invitation_image_url: z.string().url().nullable(),
  invitation_after_image_text: z.string().max(2000).nullable(),
  invitation_sms_body: z.string().max(1200).nullable(),
});

export type UpdateEventNotificationsInput = z.infer<typeof notificationsSchema>;

export async function updateEventNotifications(
  eventId: string,
  input: UpdateEventNotificationsInput
): Promise<ActionResponse> {
  const parsed = notificationsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const { error } = await supabase
    .from('events')
    .update(parsed.data)
    .eq('id', eventId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/events/${eventId}/notifications`);
  return { success: true };
}
