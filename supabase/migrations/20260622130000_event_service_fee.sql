-- Per-event toggle to pass Stripe's credit-card processing fee on to the
-- guest. When enabled, paid checkout shows a "Service Fee" line and the
-- Stripe charge is grossed-up so the venue receives the full ticket
-- subtotal. The exact fee is captured per session on the first ticket
-- (tickets.service_fee_cents) so the confirmation email + resend can
-- reproduce the receipt. Venmo orders never carry a fee.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS pass_service_fee BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS service_fee_cents INTEGER NOT NULL DEFAULT 0
    CHECK (service_fee_cents >= 0);
