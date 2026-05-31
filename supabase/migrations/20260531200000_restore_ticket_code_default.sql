-- The intended short-code default (TIX-XXXXXXXX) was supposed to land in
-- migration 006_short_ticket_codes. The function lives on prod but the
-- column default was still uuid_generate_v4()::text, so any insert that
-- omitted ticket_code (notably the original walk-in / new Add Ticket
-- action) got a 36-char UUID. Restore the function (idempotent) and
-- point the column default at it.

CREATE OR REPLACE FUNCTION public.generate_ticket_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN 'TIX-' || result;
END;
$$;

ALTER TABLE tickets ALTER COLUMN ticket_code SET DEFAULT generate_ticket_code();
