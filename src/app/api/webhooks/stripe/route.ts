import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { formatDate, formatCents, getBaseUrl } from '@/lib/utils';
import { sendEmail } from '@/lib/resend';
import { TicketConfirmationEmail } from '@/emails/ticket-confirmation-email';
import { createServiceClient } from '@/lib/supabase/service';
import { getVenueName } from '@/lib/settings';
import { generateQrDataUrl } from '@/lib/qr';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const error = err as Error;
    console.error('Webhook signature verification failed:', error.message);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const sessionId = session.id;

      // Find all pending tickets for this session
      const { data: pendingTickets, error: fetchError } = await supabase
        .from('tickets')
        .select('id, status, tier_id, quantity, attendee_name, attendee_email, event_id, ticket_code')
        .eq('stripe_session_id', sessionId)
        .eq('status', 'pending');

      if (fetchError || !pendingTickets || pendingTickets.length === 0) {
        console.error(`checkout.session.completed: no pending tickets for session ${sessionId}`);
        break;
      }

      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : null;

      // Confirm all tickets and adjust quantity_sold
      for (const ticket of pendingTickets) {
        const tier = await supabase
          .from('ticket_tiers')
          .select('price_cents')
          .eq('id', ticket.tier_id)
          .single();

        const tierPrice = tier.data?.price_cents ?? 0;
        const ticketAmount = tierPrice * ticket.quantity;

        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            status: 'confirmed',
            amount_paid_cents: ticketAmount,
            stripe_payment_intent_id: paymentIntentId,
          })
          .eq('id', ticket.id);

        if (updateError) {
          console.error(`checkout.session.completed: failed to update ticket ${ticket.id}:`, updateError.message);
          continue;
        }

        const { error: tierError } = await supabase
          .rpc('adjust_quantity_sold', { p_tier_id: ticket.tier_id, p_delta: ticket.quantity });

        if (tierError) {
          console.error(`checkout.session.completed: failed to increment quantity_sold for tier ${ticket.tier_id}:`, tierError.message);
        }
      }

      // Send one confirmation email listing all tickets
      const firstTicket = pendingTickets[0];
      if (firstTicket.attendee_email) {
        // Fetch tier names for all tickets
        const tierIds = [...new Set(pendingTickets.map((t) => t.tier_id))];
        const { data: tiersData } = await supabase
          .from('ticket_tiers')
          .select('id, name')
          .in('id', tierIds);

        const tierNameMap = new Map(tiersData?.map((t) => [t.id, t.name]) ?? []);

        const { data: eventData } = await supabase
          .from('events')
          .select('title, slug, date_start, location_name, ticket_qr_enabled, cover_image_url')
          .eq('id', firstTicket.event_id)
          .single();

        if (eventData) {
          const venueName = await getVenueName();
          const dateFormatted = formatDate(eventData.date_start, 'EEEE, MMMM d, yyyy · h:mm a');
          const amountTotal = session.amount_total ?? 0;

          const ticketQrEnabled = !!(eventData.ticket_qr_enabled);
          const baseUrl = getBaseUrl();

          const ticketLines = await Promise.all(
            pendingTickets.map(async (t) => {
              const line: { tierName: string; quantity: number; ticketCode: string; qrDataUrl?: string } = {
                tierName: tierNameMap.get(t.tier_id) ?? 'Ticket',
                quantity: t.quantity,
                ticketCode: t.ticket_code,
              };
              if (ticketQrEnabled) {
                line.qrDataUrl = await generateQrDataUrl(
                  `${baseUrl}/e/${eventData.slug}/verify/${t.ticket_code}`
                );
              }
              return line;
            })
          );

          const emailResult = await sendEmail({
            to: firstTicket.attendee_email,
            subject: `Tickets Confirmed: ${eventData.title}`,
            react: TicketConfirmationEmail({
              attendeeName: firstTicket.attendee_name,
              eventTitle: eventData.title,
              dateFormatted,
              locationName: eventData.location_name,
              tickets: ticketLines,
              amountPaidFormatted: formatCents(amountTotal),
              venueName,
              ticketQrEnabled,
              coverImageUrl: eventData.cover_image_url,
            }),
          });

          if (!emailResult.success) {
            console.error('Failed to send ticket confirmation email:', emailResult.error);
          }
        }
      }

      console.log(`checkout.session.completed: confirmed ${pendingTickets.length} ticket(s) for session ${sessionId}`);
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : null;

      if (!paymentIntentId) {
        console.log('charge.refunded: no payment_intent on charge, skipping');
        break;
      }

      // Find all tickets for this payment intent
      const { data: tickets } = await supabase
        .from('tickets')
        .select('id, status, tier_id, quantity')
        .eq('stripe_payment_intent_id', paymentIntentId);

      if (!tickets || tickets.length === 0) {
        console.log(`charge.refunded: no tickets found for payment_intent ${paymentIntentId}`);
        break;
      }

      for (const ticket of tickets) {
        if (ticket.status === 'refunded') {
          console.log(`charge.refunded: ticket ${ticket.id} already refunded`);
          continue;
        }

        const { error: refundError } = await supabase
          .from('tickets')
          .update({ status: 'refunded' })
          .eq('id', ticket.id);

        if (refundError) {
          console.error(`charge.refunded: failed to update ticket ${ticket.id}:`, refundError.message);
        } else {
          console.log(`charge.refunded: ticket ${ticket.id} marked as refunded`);

          const { error: tierError } = await supabase
            .rpc('adjust_quantity_sold', { p_tier_id: ticket.tier_id, p_delta: -ticket.quantity });

          if (tierError) {
            console.error(`charge.refunded: failed to decrement quantity_sold for tier ${ticket.tier_id}:`, tierError.message);
          }
        }
      }

      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const sessionId = session.id;

      // Delete all pending tickets for this session
      const { data: pendingTickets } = await supabase
        .from('tickets')
        .select('id')
        .eq('stripe_session_id', sessionId)
        .eq('status', 'pending');

      if (!pendingTickets || pendingTickets.length === 0) {
        console.log(`checkout.session.expired: no pending tickets for session ${sessionId}`);
        break;
      }

      const { error: deleteError } = await supabase
        .from('tickets')
        .delete()
        .eq('stripe_session_id', sessionId)
        .eq('status', 'pending');

      if (deleteError) {
        console.error(`checkout.session.expired: failed to delete tickets for session ${sessionId}:`, deleteError.message);
      } else {
        console.log(`checkout.session.expired: deleted ${pendingTickets.length} pending ticket(s) for session ${sessionId}`);
      }

      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
