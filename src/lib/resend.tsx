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

export async function sendEmail({
  to,
  subject,
  html,
  react,
}: SendEmailInput): Promise<SendEmailResult> {
  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

  try {
    const { data, error } = await resend.emails.send({
      from,
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
