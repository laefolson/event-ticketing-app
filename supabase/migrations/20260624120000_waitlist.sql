-- Waitlist feature. Sold-out events route guests to a Join Waitlist
-- form; the admin issues offers on an exception basis from a Waitlist
-- tab. Waitlist purchases create tickets with source='waitlist' so
-- reporting can split public vs waitlist counts. Position is an
-- internal sort key only and is never shown to guests.

-- 1. Per-event waitlist toggles. Default ON so newly created events
--    auto-show the form when they sell out; admins can opt out.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS waitlist_hold_hours INTEGER NOT NULL DEFAULT 24
    CHECK (waitlist_hold_hours > 0);

-- 2. Distinguish public vs waitlist ticket sales for reporting.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'public'
    CHECK (source IN ('public','waitlist'));

-- 3. New message type for custom waitlist broadcasts. Each row in
--    invitation_logs with this type is a one-to-one record of a
--    Message Waitlist send (per recipient + channel).
ALTER TYPE public.message_type ADD VALUE IF NOT EXISTS 'waitlist_custom';

-- 4. waitlist_entries — one row per (event, master_contact). Position
--    is computed at insert time (max+1 per event) and used solely to
--    sort the admin list; it is never exposed to the guest.
CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  master_contact_id UUID NOT NULL REFERENCES public.master_contacts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  tickets_requested INTEGER NOT NULL DEFAULT 1 CHECK (tickets_requested > 0),
  tickets_offered INTEGER CHECK (tickets_offered IS NULL OR tickets_offered > 0),
  tier_id UUID REFERENCES public.ticket_tiers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','offered','purchased','expired','declined','skipped')),
  offer_token TEXT UNIQUE,
  offer_expires_at TIMESTAMPTZ,
  offered_at TIMESTAMPTZ,
  purchased_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, master_contact_id)
);

CREATE INDEX IF NOT EXISTS waitlist_entries_event_id_idx
  ON public.waitlist_entries (event_id, position);
CREATE INDEX IF NOT EXISTS waitlist_entries_event_status_idx
  ON public.waitlist_entries (event_id, status);

-- 5. RLS. Public guests can INSERT (signup form) and SELECT a single
--    row matched by offer_token (the offer-acceptance page reads the
--    entry without auth). Authenticated team can do everything. Reads
--    that filter by offer_token are guarded by the WHERE clause we
--    pass from server code; the policy itself is permissive on SELECT
--    so that the public route can validate the token.
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can insert waitlist entries"
  ON public.waitlist_entries;
CREATE POLICY "Public can insert waitlist entries"
  ON public.waitlist_entries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read by offer_token"
  ON public.waitlist_entries;
CREATE POLICY "Public can read by offer_token"
  ON public.waitlist_entries
  FOR SELECT
  TO anon
  USING (offer_token IS NOT NULL);

DROP POLICY IF EXISTS "Team can read all waitlist entries"
  ON public.waitlist_entries;
CREATE POLICY "Team can read all waitlist entries"
  ON public.waitlist_entries
  FOR SELECT
  TO authenticated
  USING (public.is_team_member());

DROP POLICY IF EXISTS "Team can update waitlist entries"
  ON public.waitlist_entries;
CREATE POLICY "Team can update waitlist entries"
  ON public.waitlist_entries
  FOR UPDATE
  TO authenticated
  USING (public.is_team_member());

DROP POLICY IF EXISTS "Team can delete waitlist entries"
  ON public.waitlist_entries;
CREATE POLICY "Team can delete waitlist entries"
  ON public.waitlist_entries
  FOR DELETE
  TO authenticated
  USING (public.is_team_member());
