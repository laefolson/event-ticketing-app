import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createServiceClient } from '@/lib/supabase/service';

interface ResendWebhookPayload {
  type: string;
  data: {
    email_id: string;
    [key: string]: unknown;
  };
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('RESEND_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  let payload: ResendWebhookPayload;

  try {
    const wh = new Webhook(webhookSecret);
    payload = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookPayload;
  } catch (err) {
    const error = err as Error;
    console.error('Resend webhook signature verification failed:', error.message);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  const emailId = payload.data.email_id;

  if (!emailId) {
    console.error('Resend webhook: missing email_id in payload');
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceClient();

  switch (payload.type) {
    case 'email.delivered': {
      const { error } = await supabase
        .from('invitation_logs')
        .update({ status: 'delivered' })
        .eq('provider_message_id', emailId);

      if (error) {
        console.error(`Resend webhook: failed to update status for ${emailId}:`, error.message);
      } else {
        console.log(`Resend webhook: email ${emailId} marked as delivered`);
      }
      break;
    }

    case 'email.bounced':
    case 'email.complained': {
      const { error } = await supabase
        .from('invitation_logs')
        .update({ status: 'bounced' })
        .eq('provider_message_id', emailId);

      if (error) {
        console.error(`Resend webhook: failed to update status for ${emailId}:`, error.message);
      } else {
        console.log(`Resend webhook: email ${emailId} marked as bounced (${payload.type})`);
      }
      break;
    }

    default:
      console.log(`Resend webhook: unhandled event type ${payload.type}`);
  }

  return NextResponse.json({ received: true });
}
