import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createServiceClient } from '@/lib/supabase/service';

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
        .select('id, status, tier_id, quantity')
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
      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          status: 'confirmed',
          amount_paid_cents: session.amount_total ?? 0,
          stripe_payment_intent_id: typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
        })
        .eq('id', ticketId);

      if (updateError) {
        console.error(`checkout.session.completed: failed to update ticket ${ticketId}:`, updateError.message);
        break;
      }

      // Increment quantity_sold on the tier
      const { data: tier } = await supabase
        .from('ticket_tiers')
        .select('id, quantity_sold')
        .eq('id', existing.tier_id)
        .single();

      if (tier) {
        const { error: tierError } = await supabase
          .from('ticket_tiers')
          .update({ quantity_sold: tier.quantity_sold + existing.quantity })
          .eq('id', tier.id);

        if (tierError) {
          console.error(`checkout.session.completed: failed to increment quantity_sold for tier ${tier.id}:`, tierError.message);
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
        .select('id, status')
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
      }

      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
