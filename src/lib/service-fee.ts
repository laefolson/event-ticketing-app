// Stripe credit-card pricing — 2.9% + $0.30 per transaction. When the
// admin enables `events.pass_service_fee`, we gross up the charge so the
// venue receives the full ticket subtotal after Stripe takes their cut.
//
// Formula derivation: charging `subtotal + fee` such that
//   (subtotal + fee) * (1 - 0.029) - 0.30 = subtotal
// solves to
//   fee = (subtotal * 0.029 + 0.30) / (1 - 0.029)
//
// Rounded up to the nearest cent so the venue fully recovers the fee
// rather than eating a fraction of a cent per transaction.

const STRIPE_PERCENT = 0.029;
const STRIPE_FIXED_CENTS = 30;

export function computeServiceFeeCents(subtotalCents: number): number {
  if (subtotalCents <= 0) return 0;
  const rawCents =
    (subtotalCents * STRIPE_PERCENT + STRIPE_FIXED_CENTS) / (1 - STRIPE_PERCENT);
  return Math.ceil(rawCents);
}
