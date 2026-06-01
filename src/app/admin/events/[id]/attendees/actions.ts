'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isValidPhone, normalizePhone, PHONE_VALIDATION_MESSAGE } from '@/lib/phone';
import { sendEmail } from '@/lib/resend';
import { sendSms } from '@/lib/twilio';
import { TicketConfirmationEmail } from '@/emails/ticket-confirmation-email';
import { syncMasterContactFromCheckout } from '@/lib/checkout-master-sync';
import { getVenueName } from '@/lib/settings';
import { formatDate, formatCents, getBaseUrl, generateTicketCode } from '@/lib/utils';
import { generateQrDataUrl } from '@/lib/qr';
import type { ActionResponse } from '@/types/actions';
import type { PaymentMethod } from '@/types/database';

const paymentMethodEnum = z.enum([
  'stripe', 'cash', 'venmo', 'paypal', 'check', 'comp', 'other',
]);

const manualTicketSchema = z
  .object({
    tier_id: z.string().uuid('Invalid tier'),
    attendee_name: z.string().min(1, 'Name is required').max(500),
    attendee_email: z
      .string()
      .email('Invalid email address')
      .nullable()
      .transform((v) => v || null),
    attendee_phone: z
      .string()
      .max(30, 'Phone number too long')
      .nullable()
      .refine((v) => isValidPhone(v), PHONE_VALIDATION_MESSAGE)
      .transform((v) => v || null),
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    amount_paid_cents: z
      .number()
      .int()
      .min(0, 'Amount must be 0 or more')
      .max(100_000_00, 'Amount looks unreasonable'),
    payment_method: paymentMethodEnum,
    payment_note: z.string().max(500).nullable().optional(),
    deliver_email: z.boolean(),
    deliver_sms: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.attendee_email && !data.attendee_phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one of email or phone.',
        path: ['attendee_email'],
      });
    }
    if (data.deliver_email && !data.attendee_email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is required to deliver via email.',
        path: ['deliver_email'],
      });
    }
    if (data.deliver_sms && !data.attendee_phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone is required to deliver via SMS.',
        path: ['deliver_sms'],
      });
    }
  });

export type ManualTicketInput = z.infer<typeof manualTicketSchema>;

export interface ManualTicketResult {
  ticketId: string;
  emailSent: boolean;
  smsSent: boolean;
  deliveryError?: string;
}

export async function createManualTicket(
  eventId: string,
  input: ManualTicketInput
): Promise<ActionResponse<ManualTicketResult>> {
  const parsed = manualTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  // Verify tier belongs to this event + pull data needed for delivery.
  const { data: tier, error: tierError } = await supabase
    .from('ticket_tiers')
    .select('id, name, price_cents')
    .eq('id', parsed.data.tier_id)
    .eq('event_id', eventId)
    .single();
  if (tierError || !tier) {
    return { success: false, error: 'Tier not found for this event.' };
  }

  const attendee_phone = normalizePhone(parsed.data.attendee_phone);
  const payment_note = parsed.data.payment_note?.trim() || null;

  // Service client for the insert + master sync + delivery — keeps things
  // consistent with the Stripe webhook / RSVP paths and bypasses RLS once
  // we've already auth-checked the admin above.
  const serviceClient = createServiceClient();

  const { data: ticket, error: insertError } = await serviceClient
    .from('tickets')
    .insert({
      event_id: eventId,
      tier_id: tier.id,
      contact_id: null,
      attendee_name: parsed.data.attendee_name,
      attendee_email: parsed.data.attendee_email,
      attendee_phone,
      // Set explicitly so we never depend on whatever DEFAULT the column
      // happens to have on this DB. Matches the RSVP / Stripe checkout paths.
      ticket_code: generateTicketCode(),
      quantity: parsed.data.quantity,
      amount_paid_cents: parsed.data.amount_paid_cents,
      payment_method: parsed.data.payment_method as PaymentMethod,
      payment_note,
      status: 'confirmed',
      stripe_payment_intent_id: null,
      stripe_session_id: null,
    })
    .select('id, ticket_code')
    .single();
  if (insertError) {
    return { success: false, error: insertError.message };
  }

  const { error: rpcError } = await serviceClient.rpc('adjust_quantity_sold', {
    p_tier_id: tier.id,
    p_delta: parsed.data.quantity,
  });
  if (rpcError) {
    // The ticket exists; surface the inventory error so admins can recover.
    return { success: false, error: rpcError.message };
  }

  // Sync master_contact + create the per-event contacts join row, mirroring
  // the Stripe webhook / RSVP flow. Best-effort.
  if (parsed.data.attendee_email) {
    try {
      await syncMasterContactFromCheckout(serviceClient, {
        eventId,
        email: parsed.data.attendee_email,
        name: parsed.data.attendee_name,
        phone: attendee_phone,
        source: 'manual',
        addedBy: 'manual',
      });
    } catch (err) {
      console.error(
        `createManualTicket master sync failed for ${parsed.data.attendee_email}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // Look up the event + venue once for delivery payloads below.
  const { data: event } = await serviceClient
    .from('events')
    .select('title, slug, date_start, location_name, ticket_qr_enabled, cover_image_url')
    .eq('id', eventId)
    .single();

  let emailSent = false;
  let smsSent = false;
  let deliveryError: string | undefined;

  if (event && (parsed.data.deliver_email || parsed.data.deliver_sms)) {
    const venueName = await getVenueName();
    const dateFormatted = formatDate(event.date_start, 'EEEE, MMMM d, yyyy · h:mm a');
    const baseUrl = getBaseUrl();
    const ticketQrEnabled = !!event.ticket_qr_enabled;

    if (parsed.data.deliver_email && parsed.data.attendee_email) {
      const line: { tierName: string; quantity: number; ticketCode: string; qrDataUrl?: string } = {
        tierName: tier.name,
        quantity: parsed.data.quantity,
        ticketCode: ticket.ticket_code,
      };
      if (ticketQrEnabled) {
        line.qrDataUrl = await generateQrDataUrl(
          `${baseUrl}/e/${event.slug}/verify/${ticket.ticket_code}`
        );
      }
      const emailResult = await sendEmail({
        to: parsed.data.attendee_email,
        subject: `Your Tickets: ${event.title}`,
        react: TicketConfirmationEmail({
          attendeeName: parsed.data.attendee_name,
          eventTitle: event.title,
          dateFormatted,
          locationName: event.location_name,
          tickets: [line],
          amountPaidFormatted: formatCents(parsed.data.amount_paid_cents),
          venueName,
          ticketQrEnabled,
          coverImageUrl: event.cover_image_url,
        }),
      });
      emailSent = emailResult.success;
      if (!emailResult.success) deliveryError = `Email: ${emailResult.error}`;
      await serviceClient.from('invitation_logs').insert({
        event_id: eventId,
        contact_id: null,
        message_type: 'ticket_resend',
        channel: 'email',
        status: emailResult.success ? 'sent' : 'failed',
        provider_message_id: emailResult.messageId ?? null,
      });
    }

    if (parsed.data.deliver_sms && attendee_phone) {
      const shortDate = formatDate(event.date_start, 'MMM d');
      const verifyUrl = `${baseUrl}/e/${event.slug}/verify/${ticket.ticket_code}`;
      const qtyTag = parsed.data.quantity > 1 ? ` (x${parsed.data.quantity})` : '';
      const smsResult = await sendSms({
        to: attendee_phone,
        body: `Your ticket for ${event.title} on ${shortDate}${qtyTag}: ${ticket.ticket_code}. View: ${verifyUrl}`,
      });
      smsSent = smsResult.success;
      if (!smsResult.success) deliveryError = `SMS: ${smsResult.error}`;
      await serviceClient.from('invitation_logs').insert({
        event_id: eventId,
        contact_id: null,
        message_type: 'ticket_resend',
        channel: 'sms',
        status: smsResult.success ? 'sent' : 'failed',
        provider_message_id: smsResult.messageId ?? null,
      });
    }
  }

  return {
    success: true,
    data: {
      ticketId: ticket.id,
      emailSent,
      smsSent,
      deliveryError,
    },
  };
}

const toggleSchema = z.object({
  ticketId: z.string().uuid('Invalid ticket ID'),
  newStatus: z.enum(['confirmed', 'checked_in']),
});

export async function toggleCheckIn(
  ticketId: string,
  newStatus: 'confirmed' | 'checked_in'
): Promise<ActionResponse> {
  const parsed = toggleSchema.safeParse({ ticketId, newStatus });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const { data: ticket, error: fetchError } = await supabase
    .from('tickets')
    .select('id, status')
    .eq('id', parsed.data.ticketId)
    .single();
  if (fetchError || !ticket) {
    return { success: false, error: 'Ticket not found.' };
  }
  if (ticket.status !== 'confirmed' && ticket.status !== 'checked_in') {
    return { success: false, error: 'Ticket cannot be toggled in its current status.' };
  }

  const updateData =
    parsed.data.newStatus === 'checked_in'
      ? { status: 'checked_in' as const, checked_in_at: new Date().toISOString() }
      : { status: 'confirmed' as const, checked_in_at: null };

  const { error: updateError } = await supabase
    .from('tickets')
    .update(updateData)
    .eq('id', parsed.data.ticketId);
  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}

// ── Scan-to-check-in by ticket_code ─────────────────────────────────────

const checkInByCodeSchema = z.object({
  eventId: z.string().uuid('Invalid event'),
  // Ticket codes are short alphanum (TIX-XXXXXXXX) or legacy UUIDs; accept
  // anything sensible-looking up to a reasonable length.
  code: z.string().trim().min(1).max(120),
});

export interface CheckInByCodeResult {
  ticketId: string;
  attendeeName: string;
  tierName: string;
  quantity: number;
  alreadyCheckedIn: boolean;
}

export interface TicketLookupResult {
  ticketId: string;
  attendeeName: string;
  tierName: string;
  quantity: number;
  status: 'confirmed' | 'checked_in' | 'refunded' | 'cancelled' | 'pending';
}

/**
 * Read-only sister of checkInByCode — fetches the ticket without changing
 * its status, so the scanner can show a confirmation prompt before the
 * actual check-in. Returns the same kinds of errors as checkInByCode.
 */
export async function lookupTicketByCode(
  eventId: string,
  code: string
): Promise<ActionResponse<TicketLookupResult>> {
  const parsed = checkInByCodeSchema.safeParse({ eventId, code });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const { data: ticket, error: fetchError } = await supabase
    .from('tickets')
    .select(
      'id, status, attendee_name, quantity, ticket_tiers!inner(name)'
    )
    .eq('event_id', parsed.data.eventId)
    .eq('ticket_code', parsed.data.code)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: fetchError.message };
  }
  if (!ticket) {
    return { success: false, error: 'No ticket with that code for this event.' };
  }
  if (ticket.status === 'refunded') {
    return { success: false, error: 'This ticket was refunded.' };
  }
  if (ticket.status === 'cancelled' || ticket.status === 'pending') {
    return { success: false, error: `Ticket is ${ticket.status} — can't check in.` };
  }

  const tierName =
    (Array.isArray(ticket.ticket_tiers)
      ? ticket.ticket_tiers[0]?.name
      : (ticket.ticket_tiers as { name: string } | null)?.name) ?? 'Ticket';

  return {
    success: true,
    data: {
      ticketId: ticket.id as string,
      attendeeName: ticket.attendee_name as string,
      tierName,
      quantity: ticket.quantity as number,
      status: ticket.status as TicketLookupResult['status'],
    },
  };
}

export async function checkInByCode(
  eventId: string,
  code: string
): Promise<ActionResponse<CheckInByCodeResult>> {
  const parsed = checkInByCodeSchema.safeParse({ eventId, code });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const { data: ticket, error: fetchError } = await supabase
    .from('tickets')
    .select(
      'id, status, attendee_name, quantity, ticket_tiers!inner(name)'
    )
    .eq('event_id', parsed.data.eventId)
    .eq('ticket_code', parsed.data.code)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: fetchError.message };
  }
  if (!ticket) {
    return { success: false, error: 'No ticket with that code for this event.' };
  }
  if (ticket.status === 'refunded') {
    return { success: false, error: 'This ticket was refunded.' };
  }
  if (ticket.status === 'cancelled' || ticket.status === 'pending') {
    return { success: false, error: `Ticket is ${ticket.status} — can't check in.` };
  }

  const tierName =
    (Array.isArray(ticket.ticket_tiers)
      ? ticket.ticket_tiers[0]?.name
      : (ticket.ticket_tiers as { name: string } | null)?.name) ?? 'Ticket';

  if (ticket.status === 'checked_in') {
    return {
      success: true,
      data: {
        ticketId: ticket.id as string,
        attendeeName: ticket.attendee_name as string,
        tierName,
        quantity: ticket.quantity as number,
        alreadyCheckedIn: true,
      },
    };
  }

  // confirmed → checked_in
  const { error: updateError } = await supabase
    .from('tickets')
    .update({ status: 'checked_in', checked_in_at: new Date().toISOString() })
    .eq('id', ticket.id);
  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return {
    success: true,
    data: {
      ticketId: ticket.id as string,
      attendeeName: ticket.attendee_name as string,
      tierName,
      quantity: ticket.quantity as number,
      alreadyCheckedIn: false,
    },
  };
}
