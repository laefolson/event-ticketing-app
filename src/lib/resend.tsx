import { Resend } from 'resend';
import * as React from 'react';

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

const FROM = 'Over Yonder Farm <info@events.yonderfarm.com>';
const REPLY_TO = 'info@yonderfarm.com';

export async function sendEmail({
  to,
  subject,
  html,
  react,
}: SendEmailInput): Promise<SendEmailResult> {
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
