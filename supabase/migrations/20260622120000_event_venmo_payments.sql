-- Per-event Venmo payment option. When venmo_enabled is true the public
-- checkout offers a "Pay with Venmo" branch that creates pending tickets,
-- which the admin later confirms once the Venmo transfer is verified.
-- tickets.payment_method already supports 'venmo' (see
-- 20260531180000_ticket_payment_method.sql), so this migration only adds
-- the per-event toggle and recipient handle.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS venmo_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS venmo_handle TEXT NOT NULL DEFAULT '@Anne-Olson-24';
