export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { WaitlistManager } from './waitlist-manager';

interface WaitlistAdminPageProps {
  params: Promise<{ id: string }>;
}

export default async function WaitlistAdminPage({ params }: WaitlistAdminPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, date_start, waitlist_enabled, waitlist_hold_hours')
    .eq('id', id)
    .single();
  if (eventError || !event) notFound();

  const { data: tiers } = await supabase
    .from('ticket_tiers')
    .select('id, name, price_cents, quantity_total, quantity_sold')
    .eq('event_id', id)
    .order('sort_order', { ascending: true });

  const { data: entries } = await supabase
    .from('waitlist_entries')
    .select(
      `id, position, tickets_requested, tickets_offered, tier_id, status,
       offer_token, offer_expires_at, offered_at, purchased_at, created_at,
       master_contacts!inner(first_name, last_name, email, phone)`
    )
    .eq('event_id', id)
    .order('position', { ascending: true });

  const { data: waitlistTickets } = await supabase
    .from('tickets')
    .select('quantity, status')
    .eq('event_id', id)
    .eq('source', 'waitlist')
    .in('status', ['confirmed', 'checked_in']);
  const waitlistTicketsSold = (waitlistTickets ?? []).reduce(
    (sum, t) => sum + (t.quantity ?? 0),
    0
  );

  return (
    <WaitlistManager
      eventId={event.id}
      eventTitle={event.title}
      waitlistEnabled={event.waitlist_enabled}
      defaultHoldHours={event.waitlist_hold_hours}
      tiers={(tiers ?? []).map((t) => ({
        id: t.id as string,
        name: t.name as string,
        priceCents: t.price_cents as number,
      }))}
      entries={(entries ?? []).map((e) => {
        const m = Array.isArray(e.master_contacts)
          ? e.master_contacts[0]
          : e.master_contacts;
        return {
          id: e.id as string,
          position: e.position as number,
          firstName: (m?.first_name as string) ?? '',
          lastName: (m?.last_name as string) ?? '',
          email: (m?.email as string) ?? '',
          phone: (m?.phone as string) ?? null,
          ticketsRequested: e.tickets_requested as number,
          ticketsOffered: (e.tickets_offered as number | null) ?? null,
          tierId: (e.tier_id as string | null) ?? null,
          status: e.status as
            | 'waiting' | 'offered' | 'purchased' | 'expired' | 'declined' | 'skipped',
          offerExpiresAt: (e.offer_expires_at as string | null) ?? null,
          createdAt: e.created_at as string,
        };
      })}
      waitlistTicketsSold={waitlistTicketsSold}
    />
  );
}
