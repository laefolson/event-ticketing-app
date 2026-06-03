// Channel-aware plain-English descriptions for invitation_logs.error_code.
//
// SMS codes come from Twilio (status-callback ErrorCode); see
// https://www.twilio.com/docs/api/errors. Email codes come from Resend's
// bounce.subType (or bounce.type, or "SpamComplaint" we tag on complaints).

const TWILIO_REASONS: Record<string, string> = {
  '21211': 'Invalid phone number',
  '21408': 'SMS to this country not enabled',
  '21610': 'Recipient opted out (STOP)',
  '21612': 'Cannot route to that number',
  '21614': 'Not a valid mobile number',
  '30003': 'Recipient handset is unreachable',
  '30004': 'Message blocked',
  '30005': 'Unknown destination handset',
  '30006': 'Landline or unreachable carrier',
  '30007': 'Filtered as spam by the carrier',
  '30008': 'Unknown delivery error',
};

// Resend bounce.subType values. Resend follows the AWS SES bounce taxonomy
// for the most common cases. The "Permanent"/"Transient" fallbacks come
// from bounce.type when no subType is set.
const RESEND_REASONS: Record<string, string> = {
  General: 'Mailbox refused the message',
  NoEmail: 'Email address does not exist',
  Suppressed: 'Address is on the suppression list',
  OnAccountSuppressionList: 'Address is on the account suppression list',
  MailboxFull: 'Recipient mailbox is full',
  MessageTooLarge: 'Message too large for the recipient',
  ContentRejected: 'Content rejected by the recipient mail server',
  AttachmentRejected: 'Attachment rejected by the recipient',
  SpamComplaint: 'Recipient marked it as spam',
  Permanent: 'Permanent delivery failure',
  Transient: 'Temporary delivery failure',
  Undetermined: 'Delivery failure (cause unknown)',
};

export type DeliveryChannel = 'email' | 'sms';

export function describeDeliveryError(
  channel: DeliveryChannel | string,
  code: string | null | undefined
): string | null {
  if (!code) return null;
  const map = channel === 'sms' ? TWILIO_REASONS : RESEND_REASONS;
  return map[code] ?? null;
}

/**
 * Best-effort label for display: translated reason if we have one,
 * otherwise the raw code, otherwise a generic "delivery failed".
 */
export function deliveryErrorLabel(
  channel: DeliveryChannel | string,
  code: string | null | undefined
): string {
  const reason = describeDeliveryError(channel, code);
  if (reason) return reason;
  if (code) return `Error ${code}`;
  return 'Delivery failed';
}
