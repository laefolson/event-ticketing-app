'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
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

  // If paid tier, create Stripe product and price first
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
      console.error('Failed to create Stripe product/price:', err);
      return { success: false, error: 'Failed to set up payment for this tier. Please try again.' };
    }
  }

  const { data, error } = await supabase
    .from('ticket_tiers')
    .insert({
      event_id: eventId,
      ...parsed.data,
      stripe_price_id: stripePriceId,
    })
    .select('id')
    .single();

  if (error) {
    // If we created a Stripe price but DB insert failed, archive the Stripe product
    if (stripePriceId) {
      try {
        const priceObj = await stripe.prices.retrieve(stripePriceId);
        await stripe.products.update(priceObj.product as string, { active: false });
      } catch {
        // Best-effort cleanup
      }
    }
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

  // Fetch existing tier to check if price changed
  const { data: existingTier, error: fetchError } = await supabase
    .from('ticket_tiers')
    .select('price_cents, stripe_price_id')
    .eq('id', tierId)
    .single();

  if (fetchError || !existingTier) {
    return { success: false, error: 'Tier not found.' };
  }

  let newStripePriceId = existingTier.stripe_price_id;

  // If price changed and new price > 0, create a new Stripe price
  if (parsed.data.price_cents !== existingTier.price_cents) {
    if (parsed.data.price_cents > 0) {
      try {
        // Archive old price if it exists
        if (existingTier.stripe_price_id) {
          await stripe.prices.update(existingTier.stripe_price_id, { active: false });
          // Reuse the same product
          const oldPrice = await stripe.prices.retrieve(existingTier.stripe_price_id);
          const price = await stripe.prices.create({
            product: oldPrice.product as string,
            unit_amount: parsed.data.price_cents,
            currency: 'usd',
          });
          newStripePriceId = price.id;
        } else {
          // No existing Stripe price — create product + price
          const product = await stripe.products.create({
            name: parsed.data.name,
            metadata: { tier_id: tierId },
          });
          const price = await stripe.prices.create({
            product: product.id,
            unit_amount: parsed.data.price_cents,
            currency: 'usd',
          });
          newStripePriceId = price.id;
        }
      } catch (err) {
        console.error('Failed to update Stripe price:', err);
        return { success: false, error: 'Failed to update payment for this tier. Please try again.' };
      }
    } else {
      // Price changed to 0 (free) — archive old Stripe price
      if (existingTier.stripe_price_id) {
        try {
          await stripe.prices.update(existingTier.stripe_price_id, { active: false });
        } catch {
          // Best-effort
        }
      }
      newStripePriceId = null;
    }
  }

  const { error } = await supabase
    .from('ticket_tiers')
    .update({
      ...parsed.data,
      stripe_price_id: newStripePriceId,
    })
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
