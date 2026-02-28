-- Generate short ticket codes like TIX-X8K3F2
CREATE OR REPLACE FUNCTION generate_ticket_code()
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

-- Update default for new tickets
ALTER TABLE tickets ALTER COLUMN ticket_code SET DEFAULT generate_ticket_code();
