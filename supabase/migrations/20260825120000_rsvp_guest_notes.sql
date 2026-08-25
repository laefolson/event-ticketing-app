-- Per-event guest notes on the RSVP form. Events where one person RSVPs on
-- behalf of a household (a wedding welcome dinner, say) need a free-text box
-- for "who's coming with you" alongside the existing quantity field.
--
-- Configured on the event rather than the tier: the prompt belongs to the
-- invitation, not to the product being reserved. A tier-level flag would have
-- to show/hide the field as the guest switches tiers, and could contradict
-- itself when an event has more than one tier.
--
-- Default OFF so every existing event's RSVP form is unchanged.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_guest_notes_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rsvp_guest_notes_label TEXT,
  ADD COLUMN IF NOT EXISTS rsvp_guest_notes_required BOOLEAN NOT NULL DEFAULT FALSE;

-- The guest's answer. NULL on every ticket that predates this column and on
-- any ticket created while the event toggle is off.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS guest_notes TEXT;
