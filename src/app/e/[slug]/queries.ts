import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Event, TicketTier } from '@/types/database';

export const getEventBySlug = cache(async (slug: string): Promise<Event | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('link_active', true)
    .single();
  return data as Event | null;
});

export const getTiersForEvent = cache(async (eventId: string): Promise<TicketTier[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('ticket_tiers')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });
  return (data as TicketTier[]) ?? [];
});
