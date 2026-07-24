-- Ticket cancellation + flexible refunds.
--
-- Admins need to remove someone from a sold-out event's attendee list
-- WITHOUT reopening general public sales — the freed seat is offered from
-- the waitlist instead. Cancelling/refunding therefore does NOT touch
-- quantity_sold by default (that's what keeps the tier "sold out"); an
-- explicit "release to public" choice is recorded per ticket for the rare
-- case where the admin does want the seat back in the public pool.
--
-- The refund channel is decoupled from the original payment method: a
-- card (Stripe) purchase can be refunded via Venmo/cash/etc. Only a
-- refund_method of 'stripe' triggers an actual Stripe API refund; every
-- other method is a bookkeeping record of an out-of-band refund.

ALTER TABLE public.tickets
  -- Cancellation bookkeeping (set for both 'cancelled' and 'refunded').
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,

  -- Refund bookkeeping (only set when a refund was issued/recorded).
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_method TEXT
    CHECK (refund_method IS NULL OR refund_method IN
      ('stripe','cash','venmo','paypal','check','other')),
  ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER
    CHECK (refund_amount_cents IS NULL OR refund_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS refund_note TEXT,
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,

  -- Whether cancelling this ticket returned its seat to public sale.
  -- FALSE (default) keeps the event sold out / waitlist-only.
  ADD COLUMN IF NOT EXISTS released_to_public BOOLEAN NOT NULL DEFAULT FALSE;
