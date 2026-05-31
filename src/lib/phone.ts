/**
 * Normalize a phone number to (xxx) xxx-xxxx for US 10-digit numbers (or
 * 11-digit numbers starting with 1). International (+ prefix) numbers are
 * returned trimmed but otherwise unchanged so we don't mangle them.
 * Note: callers should run isValidPhone first to reject malformed input
 * — this function does not reject 9-digit/partial numbers, it just passes
 * them through unchanged.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return trimmed;
}

/**
 * Returns true for an empty value (phone is optional everywhere) or for a
 * value that looks like a real phone:
 *  - US 10-digit (5551234567, (555) 123-4567, 555-123-4567, etc.)
 *  - US 11-digit starting with 1 (15551234567)
 *  - International E.164-ish: starts with '+' and has 8–15 total digits
 */
export function isValidPhone(input: string | null | undefined): boolean {
  if (input === null || input === undefined) return true;
  const trimmed = String(input).trim();
  if (!trimmed) return true;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits.startsWith('1')) return true;
  if (trimmed.startsWith('+') && digits.length >= 8 && digits.length <= 15) return true;
  return false;
}

export const PHONE_VALIDATION_MESSAGE =
  'Please enter a valid phone number (10-digit US, or international starting with +)';
