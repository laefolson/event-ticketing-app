'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/types/actions';

const tierSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).nullable(),
  price_cents: z.number().int().min(0, 'Price must be 0 or more'),
  quantity_total: z.number().int().min(1, 'Quantity must be at least 1'),
  max_per_contact: z.number().int().min(1).nullable(),
  sort_order: z.number().int().min(0),
});

export type TierInput = z.infer<typeof tierSchema>;

export async function createTier(
  eventId: string,
  input: TierInput
): Promise<ActionResponse<{ tierId: string }>> {
  const parsed = tierSchema.safeParse(input);
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
    return { success: false, error: 'You must be logged in.' };
  }

  const { data, error } = await supabase
    .from('ticket_tiers')
    .insert({
      event_id: eventId,
      ...parsed.data,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: { tierId: data.id } };
}

export async function updateTier(
  tierId: string,
  input: TierInput
): Promise<ActionResponse<{ tierId: string }>> {
  const parsed = tierSchema.safeParse(input);
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
    return { success: false, error: 'You must be logged in.' };
  }

  const { error } = await supabase
    .from('ticket_tiers')
    .update(parsed.data)
    .eq('id', tierId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: { tierId } };
}

export async function deleteTier(
  tierId: string
): Promise<ActionResponse> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const { data: tier, error: fetchError } = await supabase
    .from('ticket_tiers')
    .select('quantity_sold')
    .eq('id', tierId)
    .single();

  if (fetchError || !tier) {
    return { success: false, error: 'Tier not found.' };
  }

  if (tier.quantity_sold > 0) {
    return {
      success: false,
      error: 'Cannot delete a tier that has sold tickets.',
    };
  }

  const { error } = await supabase
    .from('ticket_tiers')
    .delete()
    .eq('id', tierId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
