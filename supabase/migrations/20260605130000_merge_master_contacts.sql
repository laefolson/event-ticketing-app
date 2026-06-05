-- merge_master_contacts(from_id, to_id)
--
-- Folds the master contact `from_id` into `to_id` and deletes `from_id`.
-- Use this to recover from typo'd checkout emails: the admin invited
-- alice@gmail.com (to_id), but the buyer typed alise@gnail.com which
-- created a separate master (from_id). Merging repoints all of B's
-- event links, tickets, and invitation logs onto A, unions opt-ins,
-- backfills any nulls on A from B's data, then deletes B.
--
-- Rules:
--   * `to_id`'s email is preserved.
--   * `to_id`'s join-row invitation_channel wins where both contacts
--     are linked to the same event (admin choice beats checkout default).
--   * Opt-in flags are OR'd (never demote an existing opt-in).
--   * tickets.attendee_email is left as historical record.
--   * sms_consents is keyed by phone, not master_contact_id; no rewrite.

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
  -- in events where to also has a join row. The contacts.id changes, but
  -- the underlying ticket/log retains its event association.
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

  -- For events where only `from` has a join row, just rewrite its
  -- master_contact_id to `to`. Unique (event_id, master_contact_id) is
  -- safe here because the overlap rows were deleted above.
  UPDATE public.contacts
  SET master_contact_id = to_id
  WHERE master_contact_id = from_id;

  -- Union opt-ins; backfill nullable display fields from `from` where
  -- `to` is empty so we don't lose names/phone/contributor history.
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

  -- Safety net: if any tickets/logs still point at `from`'s join rows
  -- (events where to had no join row originally), the previous
  -- master_contact_id rewrite kept their join rows valid — nothing more
  -- to do for those. Now delete the from master.
  DELETE FROM public.master_contacts WHERE id = from_id;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_master_contacts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_master_contacts(uuid, uuid) TO service_role;
