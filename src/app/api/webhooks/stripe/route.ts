import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { format } from 'date-fns';
import { stripe } from '@/lib/stripe';
import { sendEmail } from '@/lib/resend';
import { TicketConfirmationEmail } from '@/emails/ticket-confirmation-email';
import { createServiceClient } from '@/lib/supabase/service';

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

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
      const ticketId = session.metadata?.ticket_id;

      if (!ticketId) {
        console.error('checkout.session.completed: missing ticket_id in metadata');
        break;
      }

      // Check if ticket is already confirmed (idempotent)
      const { data: existing } = await supabase
        .from('tickets')
        .select('id, status, tier_id, quantity, attendee_name, attendee_email, event_id')
        .eq('id', ticketId)
        .single();

      if (!existing) {
        console.error(`checkout.session.completed: ticket ${ticketId} not found`);
        break;
      }

      if (existing.status === 'confirmed') {
        console.log(`checkout.session.completed: ticket ${ticketId} already confirmed`);
        break;
      }

      // Update ticket to confirmed
      const amountPaidCents = session.amount_total ?? 0;
      const { data: updatedTicket, error: updateError } = await supabase
        .from('tickets')
        .update({
          status: 'confirmed',
          amount_paid_cents: amountPaidCents,
          stripe_payment_intent_id: typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
        })
        .eq('id', ticketId)
        .select('ticket_code')
        .single();

      if (updateError) {
        console.error(`checkout.session.completed: failed to update ticket ${ticketId}:`, updateError.message);
        break;
      }

      // Atomically increment quantity_sold on the tier
      const { error: tierError } = await supabase
        .rpc('adjust_quantity_sold', { p_tier_id: existing.tier_id, p_delta: existing.quantity });

      if (tierError) {
        console.error(`checkout.session.completed: failed to increment quantity_sold for tier ${existing.tier_id}:`, tierError.message);
      }

      // Send ticket confirmation email (best-effort)
      if (existing.attendee_email && updatedTicket?.ticket_code) {
        // Fetch tier name for the email
        const { data: tier } = await supabase
          .from('ticket_tiers')
          .select('name')
          .eq('id', existing.tier_id)
          .single();

        const { data: eventData } = await supabase
          .from('events')
          .select('title, date_start, location_name')
          .eq('id', existing.event_id)
          .single();

        if (eventData) {
          const dateFormatted = format(new Date(eventData.date_start), 'EEEE, MMMM d, yyyy · h:mm a');
          sendEmail({
            to: existing.attendee_email,
            subject: `Tickets Confirmed: ${eventData.title}`,
            react: TicketConfirmationEmail({
              attendeeName: existing.attendee_name,
              eventTitle: eventData.title,
              dateFormatted,
              locationName: eventData.location_name,
              tierName: tier?.name ?? 'Ticket',
              quantity: existing.quantity,
              ticketCode: updatedTicket.ticket_code,
              amountPaidFormatted: formatCents(amountPaidCents),
            }),
          }).catch((err) => {
            console.error('Failed to send ticket confirmation email:', err);
          });
        }
      }

      console.log(`checkout.session.completed: ticket ${ticketId} confirmed`);
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

      const { data: ticket } = await supabase
        .from('tickets')
        .select('id, status, tier_id, quantity')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .single();

      if (!ticket) {
        console.log(`charge.refunded: no ticket found for payment_intent ${paymentIntentId}`);
        break;
      }

      if (ticket.status === 'refunded') {
        console.log(`charge.refunded: ticket ${ticket.id} already refunded`);
        break;
      }

      const { error: refundError } = await supabase
        .from('tickets')
        .update({ status: 'refunded' })
        .eq('id', ticket.id);

      if (refundError) {
        console.error(`charge.refunded: failed to update ticket ${ticket.id}:`, refundError.message);
      } else {
        console.log(`charge.refunded: ticket ${ticket.id} marked as refunded`);

        // Atomically decrement quantity_sold on the tier
        const { error: tierError } = await supabase
          .rpc('adjust_quantity_sold', { p_tier_id: ticket.tier_id, p_delta: -ticket.quantity });

        if (tierError) {
          console.error(`charge.refunded: failed to decrement quantity_sold for tier ${ticket.tier_id}:`, tierError.message);
        }
      }

      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const ticketId = session.metadata?.ticket_id;

      if (!ticketId) {
        console.error('checkout.session.expired: missing ticket_id in metadata');
        break;
      }

      // Only clean up tickets that are still pending
      const { data: ticket } = await supabase
        .from('tickets')
        .select('id, status')
        .eq('id', ticketId)
        .single();

      if (!ticket) {
        console.log(`checkout.session.expired: ticket ${ticketId} not found`);
        break;
      }

      if (ticket.status !== 'pending') {
        console.log(`checkout.session.expired: ticket ${ticketId} is ${ticket.status}, skipping`);
        break;
      }

      const { error: deleteError } = await supabase
        .from('tickets')
        .delete()
        .eq('id', ticketId)
        .eq('status', 'pending');

      if (deleteError) {
        console.error(`checkout.session.expired: failed to delete ticket ${ticketId}:`, deleteError.message);
      } else {
        console.log(`checkout.session.expired: deleted pending ticket ${ticketId}`);
      }

      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
