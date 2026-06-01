import twilio from 'twilio';

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN environment variable');
}

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

interface SendSmsInput {
  to: string;
  body: string;
  mediaUrl?: string | null;
}

interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSms({
  to,
  body,
  mediaUrl,
}: SendSmsInput): Promise<SendSmsResult> {
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!messagingServiceSid) {
    return { success: false, error: 'TWILIO_MESSAGING_SERVICE_SID is not configured' };
  }

  try {
    const message = await client.messages.create({
      to,
      messagingServiceSid,
      body,
      ...(mediaUrl ? { mediaUrl: [mediaUrl] } : {}),
    });

    return { success: true, messageId: message.sid };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send SMS',
    };
  }
}

/**
 * Returns an MMS-friendly variant of a Supabase Storage public URL by
 * routing through the `/render/image/public/` transform endpoint with a
 * width + quality cap. Twilio's MMS guidance is ≤600 KB per attachment;
 * an 800px-wide JPEG at quality 75 is typically 80–150 KB.
 *
 * Requires Supabase Image Transformations to be enabled on the project
 * (Pro plan and above). On projects without transformations, this URL
 * returns an error — only call this from prod-only code paths or accept
 * that dev MMS will arrive without an image.
 *
 * Passes through non-Supabase URLs unchanged.
 */
export function toMmsImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = '/storage/v1/object/public/';
  if (!url.includes(marker)) return url;
  const transformed = url.replace(marker, '/storage/v1/render/image/public/');
  return `${transformed}?width=800&quality=75`;
}
