-- merge_master_contacts now also rewrites tickets.attendee_email and
-- tickets.attendee_phone for any ticket whose join row belongs to the
-- target after the merge and whose denormalized email/phone still
-- matches the source's. This stops the old (typo'd) email from
-- continuing to display on the attendees view post-merge, which was
-- the whole reason an admin invoked the merge in the first place.
--
-- Original-record fidelity is preserved by the WHERE clause: we only
-- touch rows whose attendee_email actually equals from_row.email
-- (similarly for phone). A pre-existing target ticket with a different
-- email is left alone.

CREATE OR REPLACE FUNCTION public.merge_master_contacts(
  from_id uuid,
  to_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  from_row public.master_contacts%ROWTYPE;
  to_row public.master_contacts%ROWTYPE;
BEGIN
  IF from_id = to_id THEN
    RAISE EXCEPTION 'Cannot merge a contact into itself';
  END IF;

  SELECT * INTO from_row FROM public.master_contacts WHERE id = from_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source contact % not found', from_id;
  END IF;

  SELECT * INTO to_row FROM public.master_contacts WHERE id = to_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target contact % not found', to_id;
  END IF;

  -- Repoint tickets and invitation_logs that point at from's join rows
  -- in events where to also has a join row.
  WITH overlap AS (
    SELECT
      cf.id  AS from_contact_id,
      ct.id  AS to_contact_id
    FROM public.contacts cf
    JOIN public.contacts ct
      ON ct.event_id = cf.event_id
     AND ct.master_contact_id = to_id
    WHERE cf.master_contact_id = from_id
  )
  UPDATE public.tickets t
  SET contact_id = o.to_contact_id
  FROM overlap o
  WHERE t.contact_id = o.from_contact_id;

  WITH overlap AS (
    SELECT
      cf.id  AS from_contact_id,
      ct.id  AS to_contact_id
    FROM public.contacts cf
    JOIN public.contacts ct
      ON ct.event_id = cf.event_id
     AND ct.master_contact_id = to_id
    WHERE cf.master_contact_id = from_id
  )
  UPDATE public.invitation_logs l
  SET contact_id = o.to_contact_id
  FROM overlap o
  WHERE l.contact_id = o.from_contact_id;

  -- Drop the now-redundant from-side join rows where to already has one.
  DELETE FROM public.contacts cf
  USING public.contacts ct
  WHERE cf.master_contact_id = from_id
    AND ct.master_contact_id = to_id
    AND ct.event_id = cf.event_id;

  -- For events where only `from` has a join row, rewrite to `to`.
  UPDATE public.contacts
  SET master_contact_id = to_id
  WHERE master_contact_id = from_id;

  -- Rewrite the denormalized attendee_email / attendee_phone on every
  -- ticket whose join row now belongs to `to` and whose stored value
  -- still matches the source's. This is the change vs the original
  -- function: previously the typo'd email lingered on the ticket row.
  IF from_row.email IS NOT NULL AND to_row.email IS NOT NULL THEN
    UPDATE public.tickets t
    SET attendee_email = to_row.email
    FROM public.contacts c
    WHERE c.id = t.contact_id
      AND c.master_contact_id = to_id
      AND lower(t.attendee_email) = lower(from_row.email);
  END IF;

  IF from_row.phone IS NOT NULL AND to_row.phone IS NOT NULL THEN
    UPDATE public.tickets t
    SET attendee_phone = to_row.phone
    FROM public.contacts c
    WHERE c.id = t.contact_id
      AND c.master_contact_id = to_id
      AND t.attendee_phone = from_row.phone;
  END IF;

  -- Union opt-ins; backfill nullable display fields from `from` where
  -- `to` is empty.
  UPDATE public.master_contacts
  SET
    sms_opt_in_event_updates =
      COALESCE(to_row.sms_opt_in_event_updates, false)
      OR COALESCE(from_row.sms_opt_in_event_updates, false),
    sms_opt_in_marketing =
      COALESCE(to_row.sms_opt_in_marketing, false)
      OR COALESCE(from_row.sms_opt_in_marketing, false),
    first_name = COALESCE(NULLIF(to_row.first_name, ''), from_row.first_name),
    last_name  = COALESCE(NULLIF(to_row.last_name,  ''), from_row.last_name),
    phone      = COALESCE(to_row.phone, from_row.phone),
    contributor_name = COALESCE(to_row.contributor_name, from_row.contributor_name)
  WHERE id = to_id;

  DELETE FROM public.master_contacts WHERE id = from_id;
END;
$$;
