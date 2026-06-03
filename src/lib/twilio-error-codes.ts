// Plain-English translations for the Twilio error codes most relevant to
// our outbound flow (status callback → invitation_logs.error_code).
// Full catalog: https://www.twilio.com/docs/api/errors
//
// We only map the codes we expect to surface to admins; anything else
// returns null and the caller falls back to "Delivery failed".

const TWILIO_ERROR_REASONS: Record<string, string> = {
  '21211': 'Invalid phone number',
  '21408': 'Permission to send SMS to this country not enabled',
  '21610': 'Recipient opted out (STOP)',
  '21612': 'Cannot route to that number',
  '21614': 'Number is not a valid mobile number',
  '30003': 'Recipient handset is unreachable',
  '30004': 'Message blocked',
  '30005': 'Unknown destination handset',
  '30006': 'Landline or unreachable carrier',
  '30007': 'Carrier flagged the message as filtered (spam)',
  '30008': 'Unknown delivery error',
};

export function describeTwilioError(code: string | null | undefined): string | null {
  if (!code) return null;
  return TWILIO_ERROR_REASONS[code] ?? null;
}
