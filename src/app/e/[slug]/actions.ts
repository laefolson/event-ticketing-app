'use server';

import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { formatDate } from '@/lib/utils';
import { sendEmail } from '@/lib/resend';
import { TicketConfirmationEmail } from '@/emails/ticket-confirmation-email';
import { getVenueName } from '@/lib/settings';
import { generateQrDataUrl } from '@/lib/qr';
import type { ActionResponse } from '@/types/actions';

const emailSchema = z.string().email();

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export async function resendTickets(
  slug: string,
  email: string
): Promise<ActionResponse> {
  // Validate email
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  const normalizedEmail = parsed.data.toLowerCase();
  const supabase = createServiceClient();

  // Look up event by slug
  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, date_start, location_name, ticket_qr_enabled, cover_image_url')
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('link_active', true)
    .single();

  if (!event) {
    // Don't reveal event doesn't exist
    return { success: true };
  }

  // Rate limit: check invitation_logs for ticket_resend in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Look up contact by email for this event (for rate limit tracking)
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('event_id', event.id)
    .ilike('email', normalizedEmail)
    .single();

  if (contact) {
    const { count } = await supabase
      .from('invitation_logs')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .eq('contact_id', contact.id)
      .eq('message_type', 'ticket_resend')
      .eq('channel', 'email')
      .gte('sent_at', oneHourAgo);

    if ((count ?? 0) >= 3) {
      // Rate limited — return success silently
      return { success: true };
    }
  }

  // Query confirmed tickets for this email + event
  const { data: tickets } = await supabase
    .from('tickets')
    .select('id, attendee_name, attendee_email, ticket_code, quantity, amount_paid_cents, tier_id, ticket_tiers!inner(name)')
    .eq('event_id', event.id)
    .ilike('attendee_email', normalizedEmail)
    .eq('status', 'confirmed');

  if (!tickets || tickets.length === 0) {
    // No tickets — return success (don't reveal)
    return { success: true };
  }

  // Build email data
  const venueName = await getVenueName();
  const dateFormatted = formatDate(event.date_start, 'EEEE, MMMM d, yyyy · h:mm a');
  const ticketQrEnabled = !!event.ticket_qr_enabled;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';

  const amountTotal = tickets.reduce((sum, t) => sum + t.amount_paid_cents, 0);

  const ticketLines = await Promise.all(
    tickets.map(async (t) => {
      const tierData = t.ticket_tiers as unknown as { name: string };
      const line: { tierName: string; quantity: number; ticketCode: string; qrDataUrl?: string } = {
        tierName: tierData.name,
        quantity: t.quantity,
        ticketCode: t.ticket_code,
      };
      if (ticketQrEnabled) {
        line.qrDataUrl = await generateQrDataUrl(
          `${baseUrl}/e/${event.slug}/verify/${t.ticket_code}`
        );
      }
      return line;
    })
  );

  // Send confirmation email
  const result = await sendEmail({
    to: normalizedEmail,
    subject: `Your Tickets: ${event.title}`,
    react: TicketConfirmationEmail({
      attendeeName: tickets[0].attendee_name,
      eventTitle: event.title,
      dateFormatted,
      locationName: event.location_name,
      tickets: ticketLines,
      amountPaidFormatted: formatCents(amountTotal),
      venueName,
      ticketQrEnabled,
      coverImageUrl: event.cover_image_url,
    }),
  });

  // Log for rate limiting (use contact_id if we have one)
  await supabase.from('invitation_logs').insert({
    event_id: event.id,
    contact_id: contact?.id ?? null,
    message_type: 'ticket_resend',
    channel: 'email',
    status: result.success ? 'sent' : 'failed',
    provider_message_id: result.messageId ?? null,
  });

  // Always return success to avoid revealing ticket ownership
  return { success: true };
}
