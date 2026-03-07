-- SMS consent records for TCPA compliance
CREATE TABLE sms_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  consent_type TEXT NOT NULL,        -- 'event_updates' | 'marketing'
  consent_text TEXT NOT NULL,        -- exact checkbox label the user agreed to
  ip_address TEXT NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: service role only (records written server-side)
ALTER TABLE sms_consents ENABLE ROW LEVEL SECURITY;
