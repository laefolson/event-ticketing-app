'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import type { ActionResponse } from '@/types/actions';
import type { EventType } from '@/types/database';

const faqPairSchema = z.object({
  question: z.string().min(1, 'Question is required').max(500),
  answer: z.string().min(1, 'Answer is required').max(2000),
});

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
    cover_image_url: z.string().url().nullable().optional(),
    gallery_urls: z.array(z.string().url()).optional(),
    faq: z.array(faqPairSchema).optional(),
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
  cover_image_url?: string | null;
  gallery_urls?: string[];
  faq?: Array<{ question: string; answer: string }>;
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
      gallery_urls: fields.gallery_urls ?? [],
      faq: fields.faq ?? [],
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

// --- Tier creation for the wizard ---

const tierInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).nullable(),
  price_cents: z.number().int().min(0, 'Price must be 0 or more'),
  quantity_total: z.number().int().min(1, 'Quantity must be at least 1'),
  max_per_contact: z.number().int().min(1).nullable(),
  sort_order: z.number().int().min(0),
});

export type WizardTierInput = z.infer<typeof tierInputSchema>;

export async function createTiersForEvent(
  eventId: string,
  tiers: WizardTierInput[]
): Promise<ActionResponse<void>> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  // Capacity enforcement
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('capacity')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return { success: false, error: 'Event not found.' };
  }

  if (event.capacity !== null) {
    const totalQty = tiers.reduce((sum, t) => sum + (t.quantity_total ?? 0), 0);
    if (totalQty > event.capacity) {
      return {
        success: false,
        error: `Total tier quantity (${totalQty}) exceeds event capacity (${event.capacity}).`,
      };
    }
  }

  const errors: string[] = [];

  for (let i = 0; i < tiers.length; i++) {
    const parsed = tierInputSchema.safeParse(tiers[i]);
    if (!parsed.success) {
      errors.push(`Tier ${i + 1}: ${parsed.error.issues[0].message}`);
      continue;
    }

    let stripePriceId: string | null = null;

    if (parsed.data.price_cents > 0) {
      try {
        const product = await stripe.products.create({
          name: parsed.data.name,
          metadata: { event_id: eventId },
        });

        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: parsed.data.price_cents,
          currency: 'usd',
        });

        stripePriceId = price.id;
      } catch (err) {
        console.error(`Failed to create Stripe product/price for tier ${i + 1}:`, err);
        errors.push(`Tier ${i + 1} ("${parsed.data.name}"): Failed to set up payment.`);
        continue;
      }
    }

    const { error } = await supabase.from('ticket_tiers').insert({
      event_id: eventId,
      ...parsed.data,
      stripe_price_id: stripePriceId,
    });

    if (error) {
      // If Stripe price was created but DB insert failed, archive it
      if (stripePriceId) {
        try {
          const priceObj = await stripe.prices.retrieve(stripePriceId);
          await stripe.products.update(priceObj.product as string, { active: false });
        } catch {
          // Best-effort cleanup
        }
      }
      errors.push(`Tier ${i + 1} ("${parsed.data.name}"): ${error.message}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join('\n') };
  }

  return { success: true, data: undefined };
}

// --- Default host bio ---

export async function getDefaultHostBio(): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'default_host_bio')
    .single();

  if (!data?.value) return null;

  try {
    return JSON.parse(data.value) as string;
  } catch {
    return data.value;
  }
}
