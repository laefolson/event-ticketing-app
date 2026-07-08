// Lazy expiry for waitlist offers. An offer sits in `offered` status with an
// `offer_expires_at` timestamp; nothing in the request path flips it once the
// hold window lapses, so without this sweep an expired offer stays stuck as
// `offered` and the admin never gets the "Re-offer" action back.
//
// This runs when the admin opens the Waitlist tab (see the waitlist admin
// page). It flips every lapsed offer for the event to `expired`, then sends
// the guest the "your offer has expired" email best-effort. It is idempotent:
// re-running finds nothing to do. Per the spec we do NOT auto-offer the next
// person — expiry only unblocks the admin to re-offer manually.

import { createServiceClient } from '@/lib/supabase/service';
import { sendEmail } from '@/lib/resend';
import { WaitlistOfferExpiredEmail } from '@/emails/waitlist-offer-expired-email';
import { getVenueName } from '@/lib/settings';
import { getBaseUrl } from '@/lib/utils';

/**
 * Flip any `offered` waitlist entries for this event whose `offer_expires_at`
 * has passed to `expired`, and email the guest. Returns the number expired.
 */
export async function expireStaleWaitlistOffers(eventId: string): Promise<number> {
  const service = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: stale, error: fetchErr } = await service
    .from('waitlist_entries')
    .select('id, master_contact_id')
    .eq('event_id', eventId)
    .eq('status', 'offered')
    .lt('offer_expires_at', nowIso);

  if (fetchErr) {
    console.error('expireStaleWaitlistOffers fetch failed:', fetchErr.message);
    return 0;
  }
  if (!stale || stale.length === 0) return 0;

  const ids = stale.map((e) => e.id as string);
  const { error: updateErr } = await service
    .from('waitlist_entries')
    .update({ status: 'expired' })
    .in('id', ids);
  if (updateErr) {
    console.error('expireStaleWaitlistOffers update failed:', updateErr.message);
    return 0;
  }

  // Notify each guest their offer lapsed — best effort, never blocks.
  const { data: event } = await service
    .from('events')
    .select('slug, title, location_name')
    .eq('id', eventId)
    .single();

  if (event) {
    const venueName = await getVenueName();
    const eventUrl = `${getBaseUrl()}/e/${event.slug}`;
    const { data: masters } = await service
      .from('master_contacts')
      .select('id, first_name, email')
      .in('id', stale.map((e) => e.master_contact_id as string));
    const byId = new Map((masters ?? []).map((m) => [m.id as string, m]));

    for (const e of stale) {
      const m = byId.get(e.master_contact_id as string);
      const email = m?.email as string | undefined;
      if (!email) continue;
      sendEmail({
        to: email,
        subject: `Your ticket offer for ${event.title} has expired`,
        react: WaitlistOfferExpiredEmail({
          firstName: (m?.first_name as string) || 'there',
          eventTitle: event.title,
          eventUrl,
          venueName,
          bannerText: event.location_name ?? venueName,
        }),
      }).catch((err) =>
        console.error('expireStaleWaitlistOffers email failed:', err)
      );
    }
  }

  return ids.length;
}
