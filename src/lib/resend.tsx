import { Resend } from 'resend';
import * as React from 'react';

if (!process.env.RESEND_API_KEY) {
  throw new Error('Missing RESEND_API_KEY environment variable');
}

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailInput {
  to: string;
  subject: string;
  html?: string;
  react?: React.ReactElement;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const FROM = process.env.EMAIL_FROM ?? 'Over Yonder Farm <info@events.yonderfarm.com>';
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? 'info@yonderfarm.com';

/**
 * Outside production, live sends are suppressed by default. Nothing about
 * running the app locally — testing a checkout, replaying a webhook, poking
 * at an RSVP form — should be able to email a real guest or burn Resend
 * quota. `NODE_ENV` is the gate, so `next dev` and test runs are covered.
 *
 * Two escape hatches for when you do want real delivery in dev:
 *   EMAIL_DEV_SEND=true              send everything for real
 *   EMAIL_DEV_ALLOWLIST=me@you.com   comma-separated; send only to these
 *
 * Note this does NOT cover Vercel preview deployments, which build with
 * NODE_ENV=production. Set EMAIL_DEV_SEND / an allowlist per-environment if
 * previews should be held back too.
 */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEV_SEND_ALL = process.env.EMAIL_DEV_SEND === 'true';
const DEV_ALLOWLIST = new Set(
  (process.env.EMAIL_DEV_ALLOWLIST ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean)
);

/** Sentinel written to invitation_logs.provider_message_id for skipped sends. */
const DEV_SKIPPED_MESSAGE_ID = 'dev-skipped';

function shouldSendLive(to: string): boolean {
  if (IS_PRODUCTION || DEV_SEND_ALL) return true;
  return DEV_ALLOWLIST.has(to.trim().toLowerCase());
}

export async function sendEmail({
  to,
  subject,
  html,
  react,
}: SendEmailInput): Promise<SendEmailResult> {
  // Report success so dev flows that branch on the result (marking a contact
  // invited, writing an invitation_logs row) behave as they do in production.
  // The sentinel message id makes the skip visible in those rows.
  if (!shouldSendLive(to)) {
    console.info(
      `[email:dev-skip] to=${to} subject=${JSON.stringify(subject)} — ` +
        'set EMAIL_DEV_SEND=true or add the address to EMAIL_DEV_ALLOWLIST to send for real'
    );
    return { success: true, messageId: DEV_SKIPPED_MESSAGE_ID };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to,
      subject,
      ...(react ? { react } : { html: html ?? '' }),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email',
    };
  }
}
