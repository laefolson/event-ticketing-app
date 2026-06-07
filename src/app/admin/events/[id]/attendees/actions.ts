'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isValidPhone, normalizePhone, PHONE_VALIDATION_MESSAGE } from '@/lib/phone';
import { sendEmail } from '@/lib/resend';
import { sendSms, toMmsImageUrl } from '@/lib/twilio';
import { TicketConfirmationEmail } from '@/emails/ticket-confirmation-email';
import { EventUpdateEmail } from '@/emails/event-update-email';
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
          bannerText: event.location_name ?? venueName,
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

// ── Resend tickets ──────────────────────────────────────────────────────

const resendSchema = z
  .object({
    ticketId: z.string().uuid('Invalid ticket'),
    email: z.string().email().nullable().optional(),
    phone: z
      .string()
      .max(30)
      .nullable()
      .optional()
      .refine((v) => v == null || v === '' || isValidPhone(v), PHONE_VALIDATION_MESSAGE),
    sendEmail: z.boolean(),
    sendSms: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.sendEmail && !data.sendSms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pick at least one channel.',
        path: ['sendEmail'],
      });
    }
  });

export type ResendTicketsInput = z.infer<typeof resendSchema>;

export interface ResendTicketsResult {
  emailSent: boolean;
  smsSent: boolean;
  ticketsUpdated: number;
  bundleSize: number;
  deliveryError?: string;
}

/**
 * Resend the ticket-confirmation bundle for one attendee. "Bundle" =
 * every confirmed/checked-in ticket in this event whose attendee_email
 * matches the clicked ticket's email (this mirrors how the original
 * Stripe-webhook confirmation send groups multi-ticket purchases into
 * one email).
 *
 * If `email` or `phone` are supplied and differ from the stored value,
 * every ticket in the bundle is rewritten to the new contact info
 * before sending — useful for recovering from a typo'd address that's
 * been merged at the master level but is still stuck on the ticket row.
 */
export async function resendTickets(
  input: ResendTicketsInput
): Promise<ActionResponse<ResendTicketsResult>> {
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const service = createServiceClient();

  // Fetch the clicked ticket so we know which bundle (event + email) to
  // resend, and we have the current attendee_email/phone to detect overrides.
  const { data: anchorTicket, error: anchorErr } = await service
    .from('tickets')
    .select('id, event_id, attendee_email, attendee_phone')
    .eq('id', v.ticketId)
    .single();
  if (anchorErr || !anchorTicket) {
    return { success: false, error: 'Ticket not found.' };
  }

  const currentEmail = (anchorTicket.attendee_email as string | null) ?? null;
  const newEmail = v.email !== undefined ? (v.email || null) : currentEmail;
  const newPhone =
    v.phone !== undefined && v.phone !== null
      ? (normalizePhone(v.phone) || null)
      : (anchorTicket.attendee_phone as string | null) ?? null;

  if (v.sendEmail && !newEmail) {
    return { success: false, error: 'Email channel requires an email address.' };
  }
  if (v.sendSms && !newPhone) {
    return { success: false, error: 'SMS channel requires a phone number.' };
  }

  // Build the bundle: every confirmed/checked-in ticket in this event
  // with the same current attendee_email as the anchor.
  let bundleQuery = service
    .from('tickets')
    .select('id, attendee_name, ticket_code, quantity, amount_paid_cents, tier_id, attendee_email, attendee_phone, contact_id')
    .eq('event_id', anchorTicket.event_id)
    .in('status', ['confirmed', 'checked_in']);
  if (currentEmail) {
    bundleQuery = bundleQuery.ilike('attendee_email', currentEmail);
  } else {
    bundleQuery = bundleQuery.eq('id', v.ticketId);
  }
  const { data: bundle, error: bundleErr } = await bundleQuery;
  if (bundleErr || !bundle || bundle.length === 0) {
    return { success: false, error: 'No matching tickets to resend.' };
  }

  // Apply email/phone override across the whole bundle if changed.
  let ticketsUpdated = 0;
  const patch: { attendee_email?: string | null; attendee_phone?: string | null } = {};
  if ((newEmail ?? null) !== (currentEmail ?? null)) {
    patch.attendee_email = newEmail;
  }
  if ((newPhone ?? null) !== ((anchorTicket.attendee_phone as string | null) ?? null)) {
    patch.attendee_phone = newPhone;
  }
  if (Object.keys(patch).length > 0) {
    const ids = bundle.map((t) => t.id as string);
    const { error: patchErr, data: patchData } = await service
      .from('tickets')
      .update(patch)
      .in('id', ids)
      .select('id');
    if (patchErr) {
      return { success: false, error: patchErr.message };
    }
    ticketsUpdated = patchData?.length ?? 0;
    for (const t of bundle) {
      if (patch.attendee_email !== undefined) t.attendee_email = patch.attendee_email;
      if (patch.attendee_phone !== undefined) t.attendee_phone = patch.attendee_phone;
    }
  }

  // If the admin just added an email to a ticket that didn't have one
  // (or changed it), upsert into master_contacts + create/refresh the
  // contacts join row for this event. Without this, phone-only tickets
  // stay invisible in /admin/contacts after the email is set. Same
  // helper that runs from checkout and free RSVP.
  if (newEmail && newEmail !== currentEmail) {
    try {
      await syncMasterContactFromCheckout(service, {
        eventId: anchorTicket.event_id,
        email: newEmail,
        name: bundle[0].attendee_name as string,
        phone: newPhone,
        smsOptInEvent: false,
        smsOptInMarketing: false,
        source: 'manual',
        addedBy: 'manual',
      });
    } catch (err) {
      console.error(
        `resendTickets master sync failed for ${newEmail}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // Pull event details + tier names for the email/SMS templates.
  const { data: event, error: eventErr } = await service
    .from('events')
    .select('id, title, slug, date_start, location_name, ticket_qr_enabled, cover_image_url')
    .eq('id', anchorTicket.event_id)
    .single();
  if (eventErr || !event) {
    return { success: false, error: 'Event not found.' };
  }

  const tierIds = Array.from(new Set(bundle.map((t) => t.tier_id as string)));
  const { data: tierRows } = await service
    .from('ticket_tiers')
    .select('id, name')
    .in('id', tierIds);
  const tierNameById = new Map((tierRows ?? []).map((t) => [t.id as string, t.name as string]));

  const venueName = await getVenueName();
  const dateFormatted = formatDate(event.date_start, 'EEEE, MMMM d, yyyy · h:mm a');
  const ticketQrEnabled = !!event.ticket_qr_enabled;
  const baseUrl = getBaseUrl();
  const attendeeName = (bundle[0].attendee_name as string) ?? 'Guest';
  const amountTotal = bundle.reduce(
    (sum, t) => sum + ((t.amount_paid_cents as number | null) ?? 0),
    0
  );

  const result: ResendTicketsResult = {
    emailSent: false,
    smsSent: false,
    ticketsUpdated,
    bundleSize: bundle.length,
  };
  const errors: string[] = [];

  if (v.sendEmail && newEmail) {
    const ticketLines = await Promise.all(
      bundle.map(async (t) => {
        const line: { tierName: string; quantity: number; ticketCode: string; qrDataUrl?: string } = {
          tierName: tierNameById.get(t.tier_id as string) ?? 'Ticket',
          quantity: (t.quantity as number) ?? 1,
          ticketCode: t.ticket_code as string,
        };
        if (ticketQrEnabled) {
          line.qrDataUrl = await generateQrDataUrl(
            `${baseUrl}/e/${event.slug}/verify/${t.ticket_code}`
          );
        }
        return line;
      })
    );

    const emailResult = await sendEmail({
      to: newEmail,
      subject: `Your Tickets: ${event.title}`,
      react: TicketConfirmationEmail({
        attendeeName,
        eventTitle: event.title,
        dateFormatted,
        locationName: event.location_name,
        tickets: ticketLines,
        amountPaidFormatted: formatCents(amountTotal),
        venueName,
        bannerText: event.location_name ?? venueName,
        ticketQrEnabled,
        coverImageUrl: event.cover_image_url,
      }),
    });
    result.emailSent = emailResult.success;
    if (!emailResult.success) errors.push(`Email: ${emailResult.error}`);

    // One log row attributed to the anchor ticket's join row so the
    // attendees view's bounceByEmail lookup picks this resend up too.
    await service.from('invitation_logs').insert({
      event_id: anchorTicket.event_id,
      contact_id: (anchorTicket as { contact_id?: string | null }).contact_id ?? null,
      message_type: 'ticket_resend',
      channel: 'email',
      status: emailResult.success ? 'sent' : 'failed',
      provider_message_id: emailResult.messageId ?? null,
    });
  }

  if (v.sendSms && newPhone) {
    const shortDate = formatDate(event.date_start, 'MMM d');
    const codes = bundle.map((t) => t.ticket_code as string);
    const firstCode = codes[0];
    const verifyUrl = `${baseUrl}/e/${event.slug}/verify/${firstCode}`;
    const body =
      bundle.length === 1
        ? `Your ticket for ${event.title} on ${shortDate}: ${firstCode}. View: ${verifyUrl}`
        : `Your ${bundle.length} tickets for ${event.title} on ${shortDate}. Codes: ${codes.join(', ')}. View: ${verifyUrl}`;

    const smsResult = await sendSms({ to: newPhone, body });
    result.smsSent = smsResult.success;
    if (!smsResult.success) errors.push(`SMS: ${smsResult.error}`);

    await service.from('invitation_logs').insert({
      event_id: anchorTicket.event_id,
      contact_id: (anchorTicket as { contact_id?: string | null }).contact_id ?? null,
      message_type: 'ticket_resend',
      channel: 'sms',
      status: smsResult.success ? 'sent' : 'failed',
      provider_message_id: smsResult.messageId ?? null,
    });
  }

  if (errors.length > 0) {
    result.deliveryError = errors.join(' · ');
  }

  return { success: true, data: result };
}

// ── Event Updates (broadcast to confirmed attendees) ────────────────────

export type EventUpdateScope = 'all' | 'selected';
export type EventUpdateChannelMode = 'smart' | 'email_only';

const eventUpdateSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  scope: z.enum(['all', 'selected']),
  ticketIds: z.array(z.string().uuid()).optional(),
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  body: z.string().trim().min(1, 'Message body is required').max(4000),
  channelMode: z.enum(['smart', 'email_only']),
});

export type SendEventUpdatesInput = z.infer<typeof eventUpdateSchema>;

export interface EventUpdateResult {
  /** Attendees who got at least one message (email OR SMS, not both). */
  recipients: number;
  /** Attendees with no eligible channel (no email, and not opted in for SMS). */
  skipped: number;
  /** Count of SMS messages sent. */
  smsSent: number;
  /** Count of email messages sent. */
  emailSent: number;
  /** Count of delivery failures across both channels. */
  failed: number;
  failedDetails: string[];
}

/**
 * Broadcast a custom subject + body to confirmed/checked-in ticket
 * holders for this event. Dedupes on `attendee_email` so a multi-
 * ticket buyer gets one message, not one per ticket. Uses the event
 * cover image (the invitation image is reserved for sales nudges).
 * Logs every send to `invitation_logs` as `event_update` so Resend
 * and Twilio webhooks can mark them delivered/bounced/failed.
 */
export async function sendEventUpdates(
  input: SendEventUpdatesInput
): Promise<ActionResponse<EventUpdateResult>> {
  const parsed = eventUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }
  const { eventId, scope, ticketIds, subject, body, channelMode } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in.' };
  }

  const service = createServiceClient();

  const { data: event, error: eventErr } = await service
    .from('events')
    .select('id, title, slug, date_start, location_name, cover_image_url')
    .eq('id', eventId)
    .single();
  if (eventErr || !event) {
    return { success: false, error: 'Event not found.' };
  }

  let ticketQuery = service
    .from('tickets')
    .select('id, attendee_name, attendee_email, attendee_phone, contact_id')
    .eq('event_id', eventId)
    .in('status', ['confirmed', 'checked_in']);

  if (scope === 'selected') {
    if (!ticketIds || ticketIds.length === 0) {
      return { success: false, error: 'No tickets selected.' };
    }
    ticketQuery = ticketQuery.in('id', ticketIds);
  }

  const { data: tickets, error: ticketsErr } = await ticketQuery;
  if (ticketsErr) return { success: false, error: ticketsErr.message };
  if (!tickets || tickets.length === 0) {
    return { success: false, error: 'No matching attendees.' };
  }

  // Dedupe by attendee_email. A multi-ticket buyer purchased once and
  // expects one event-update message, not one per ticket. The first
  // ticket we encounter for an email becomes the representative — its
  // name and contact_id seed the email + invitation_logs row.
  type Rep = {
    name: string;
    email: string | null;
    phone: string | null;
    contactId: string | null;
  };
  const byEmail = new Map<string, Rep>();
  const phoneOnly: Rep[] = [];
  for (const t of tickets) {
    const email = ((t.attendee_email as string | null) ?? '').toLowerCase();
    const rep: Rep = {
      name: (t.attendee_name as string) ?? 'Guest',
      email: (t.attendee_email as string | null) ?? null,
      phone: (t.attendee_phone as string | null) ?? null,
      contactId: (t.contact_id as string | null) ?? null,
    };
    if (email) {
      if (!byEmail.has(email)) byEmail.set(email, rep);
    } else if (rep.phone) {
      // Phone-only attendees still receive SMS updates if enabled.
      phoneOnly.push(rep);
    }
  }
  const recipients = [...byEmail.values(), ...phoneOnly];

  // Only send SMS to phones that have an event-updates consent record
  // for this event. sms_consents is the legal log of the buyer's
  // checkbox at checkout/RSVP — keying off it (not the master flag)
  // means we honor the consent that was given for THIS event, even if
  // the buyer later flipped their master preference. Phones are
  // normalized to digits for matching so format differences don't
  // cause silent skips.
  const { data: smsConsents } = await service
    .from('sms_consents')
    .select('phone')
    .eq('event_id', eventId)
    .eq('consent_type', 'event_updates');
  const optedInPhones = new Set(
    (smsConsents ?? [])
      .map((c) => ((c.phone as string | null) ?? '').replace(/\D/g, ''))
      .filter(Boolean)
  );

  const venueName = await getVenueName();
  const origin = getBaseUrl();
  const eventUrl = `${origin}/e/${event.slug}`;
  const bannerText = event.location_name ?? venueName;
  const imageUrl = event.cover_image_url;

  let emailSent = 0;
  let smsSent = 0;
  let failed = 0;
  let skipped = 0;
  let recipientsReached = 0;
  const failedDetails: string[] = [];

  for (const r of recipients) {
    const firstName = (r.name.split(/\s+/)[0] || 'Guest').trim();
    const phoneDigits = r.phone ? r.phone.replace(/\D/g, '') : '';
    const phoneOptedIn = !!phoneDigits && optedInPhones.has(phoneDigits);

    // One channel per attendee. In smart mode, SMS wins if they opted
    // in — texts cut through noise for time-sensitive updates. In
    // email_only mode, SMS is never used.
    let preferredChannel: 'sms' | 'email' | null = null;
    if (channelMode === 'smart') {
      if (phoneOptedIn && r.phone) preferredChannel = 'sms';
      else if (r.email) preferredChannel = 'email';
    } else {
      if (r.email) preferredChannel = 'email';
    }

    if (!preferredChannel) {
      skipped++;
      continue;
    }

    if (preferredChannel === 'email' && r.email) {
      const emailResult = await sendEmail({
        to: r.email,
        subject,
        react: EventUpdateEmail({
          firstName,
          eventTitle: event.title,
          eventUrl,
          venueName,
          bannerText,
          headline: subject,
          body,
          imageUrl,
        }),
      });

      await service.from('invitation_logs').insert({
        event_id: eventId,
        contact_id: r.contactId,
        message_type: 'event_update',
        channel: 'email',
        status: emailResult.success ? 'sent' : 'failed',
        provider_message_id: emailResult.messageId ?? null,
      });

      if (emailResult.success) {
        emailSent++;
        recipientsReached++;
      } else {
        failed++;
        failedDetails.push(`${r.name} (email): ${emailResult.error}`);
      }
    } else if (preferredChannel === 'sms' && r.phone) {
      const smsBody = `${body.trim()} ${eventUrl}`;
      const smsResult = await sendSms({
        to: r.phone,
        body: smsBody,
        mediaUrl: toMmsImageUrl(imageUrl),
      });

      await service.from('invitation_logs').insert({
        event_id: eventId,
        contact_id: r.contactId,
        message_type: 'event_update',
        channel: 'sms',
        status: smsResult.success ? 'sent' : 'failed',
        provider_message_id: smsResult.messageId ?? null,
      });

      if (smsResult.success) {
        smsSent++;
        recipientsReached++;
      } else {
        failed++;
        failedDetails.push(`${r.name} (sms): ${smsResult.error}`);
      }
    }
  }

  return {
    success: true,
    data: {
      recipients: recipientsReached,
      skipped,
      emailSent,
      smsSent,
      failed,
      failedDetails,
    },
  };
}
