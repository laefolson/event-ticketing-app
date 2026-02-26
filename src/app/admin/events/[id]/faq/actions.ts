'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/types/actions';

const faqSchema = z.array(
  z.object({
    question: z.string().min(1, 'Question is required').max(500),
    answer: z.string().min(1, 'Answer is required').max(2000),
  })
);

export type FaqItem = { question: string; answer: string };

export async function updateFaq(
  eventId: string,
  faq: FaqItem[]
): Promise<ActionResponse> {
  const parsed = faqSchema.safeParse(faq);
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
    .from('events')
    .update({ faq: parsed.data })
    .eq('id', eventId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
