import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('TWILIO_AUTH_TOKEN is not configured');
    return new NextResponse('Server error', { status: 500 });
  }

  const formData = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    params[key] = value as string;
  }

  // Validate the request signature
  const twilioSignature = request.headers.get('x-twilio-signature');
  if (!twilioSignature) {
    return new NextResponse('Missing signature', { status: 400 });
  }

  const url = request.url;
  const isValid = twilio.validateRequest(authToken, twilioSignature, url, params);

  if (!isValid) {
    console.error('Twilio webhook: invalid request signature');
    return new NextResponse('Invalid signature', { status: 400 });
  }

  const messageSid = params.MessageSid;
  const messageStatus = params.MessageStatus;

  if (!messageSid || !messageStatus) {
    console.log('Twilio webhook: missing MessageSid or MessageStatus');
    return new NextResponse('OK', { status: 200 });
  }

  let dbStatus: 'delivered' | 'failed' | null = null;

  switch (messageStatus) {
    case 'delivered':
      dbStatus = 'delivered';
      break;
    case 'undelivered':
    case 'failed':
      dbStatus = 'failed';
      break;
    default:
      // Other statuses like queued, sent, etc. — no action needed
      console.log(`Twilio webhook: ignoring status ${messageStatus} for ${messageSid}`);
      return new NextResponse('OK', { status: 200 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('invitation_logs')
    .update({ status: dbStatus })
    .eq('provider_message_id', messageSid);

  if (error) {
    console.error(`Twilio webhook: failed to update status for ${messageSid}:`, error.message);
  } else {
    console.log(`Twilio webhook: message ${messageSid} marked as ${dbStatus}`);
  }

  return new NextResponse('OK', { status: 200 });
}
