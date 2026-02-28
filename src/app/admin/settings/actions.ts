'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/types/actions';

const hostBioSchema = z.object({
  value: z.string().max(2000, 'Host bio must be 2000 characters or fewer.'),
});

const venueNameSchema = z.object({
  value: z.string().min(1, 'Venue name is required.').max(200, 'Venue name must be 200 characters or fewer.'),
});

async function requireAdmin(): Promise<
  { userId: string } | { error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'You must be logged in.' };
  }

  const { data: member } = await supabase
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!member || member.role !== 'admin') {
    return { error: 'Only admins can manage settings.' };
  }

  return { userId: user.id };
}

export async function updateDefaultHostBio(
  value: string
): Promise<ActionResponse> {
  const parsed = hostBioSchema.safeParse({ value });
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { success: false, error: firstError.message };
  }

  const auth = await requireAdmin();
  if ('error' in auth) {
    return { success: false, error: auth.error };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'default_host_bio', value: JSON.stringify(parsed.data.value), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function updateVenueName(
  value: string
): Promise<ActionResponse> {
  const parsed = venueNameSchema.safeParse({ value });
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { success: false, error: firstError.message };
  }

  const auth = await requireAdmin();
  if ('error' in auth) {
    return { success: false, error: auth.error };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'venue_name', value: JSON.stringify(parsed.data.value), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
