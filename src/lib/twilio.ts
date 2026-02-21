import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

interface SendSmsInput {
  to: string;
  body: string;
}

interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSms({
  to,
  body,
}: SendSmsInput): Promise<SendSmsResult> {
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!from) {
    return { success: false, error: 'TWILIO_PHONE_NUMBER is not configured' };
  }

  try {
    const message = await client.messages.create({
      to,
      from,
      body,
    });

    return { success: true, messageId: message.sid };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send SMS',
    };
  }
}
