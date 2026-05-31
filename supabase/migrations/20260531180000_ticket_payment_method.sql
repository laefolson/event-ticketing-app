-- Track how a ticket was paid for (or comped) so admins can record manual
-- Venmo/Cash/Check/PayPal sales and comps alongside the existing Stripe
-- flow. payment_note is optional free text (Venmo handle, check #,
-- "Comped by Lyle", etc).
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'stripe'
    CHECK (payment_method IN ('stripe','cash','venmo','paypal','check','comp','other'));

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS payment_note TEXT;

-- Backfill any pre-existing rows that don't fit the 'stripe' default.
UPDATE tickets
SET payment_method = 'comp'
WHERE amount_paid_cents = 0
  AND stripe_payment_intent_id IS NULL
  AND payment_method = 'stripe';
