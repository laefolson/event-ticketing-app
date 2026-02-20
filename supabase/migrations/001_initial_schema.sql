-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enums
CREATE TYPE event_type AS ENUM ('dinner', 'concert', 'movie_night', 'other');
CREATE TYPE event_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE invitation_channel AS ENUM ('email', 'sms', 'both', 'none');
CREATE TYPE ticket_status AS ENUM ('pending', 'confirmed', 'checked_in', 'cancelled', 'refunded');
CREATE TYPE team_role AS ENUM ('admin', 'helper');
CREATE TYPE message_type AS ENUM ('invitation', 'thank_you');
CREATE TYPE message_channel AS ENUM ('email', 'sms');
CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'failed', 'bounced');

-- Table: events
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    event_type event_type NOT NULL,
    description TEXT,
    date_start TIMESTAMPTZ NOT NULL,
    date_end TIMESTAMPTZ NOT NULL,
    location_name TEXT,
    location_address TEXT,
    capacity INTEGER,
    is_published BOOLEAN DEFAULT FALSE,
    cover_image_url TEXT,
    gallery_urls TEXT[] DEFAULT '{}',
    host_bio TEXT,
    faq JSONB DEFAULT '[]',
    status event_status DEFAULT 'draft',
    link_active BOOLEAN DEFAULT TRUE,
    archived_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: ticket_tiers
CREATE TABLE ticket_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER DEFAULT 0,
    quantity_total INTEGER NOT NULL,
    quantity_sold INTEGER DEFAULT 0,
    max_per_contact INTEGER,
    stripe_price_id TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: contacts
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    invitation_channel invitation_channel DEFAULT 'none',
    invited_at TIMESTAMPTZ,
    csv_source TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: tickets
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES ticket_tiers(id) ON DELETE RESTRICT,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    attendee_name TEXT NOT NULL,
    attendee_email TEXT,
    attendee_phone TEXT,
    ticket_code TEXT UNIQUE NOT NULL DEFAULT uuid_generate_v4()::TEXT,
    quantity INTEGER DEFAULT 1,
    stripe_payment_intent_id TEXT,
    stripe_session_id TEXT,
    amount_paid_cents INTEGER DEFAULT 0,
    status ticket_status DEFAULT 'pending',
    checked_in_at TIMESTAMPTZ,
    purchased_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: team_members
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role team_role NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    invited_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: csv_imports
CREATE TABLE csv_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    row_count INTEGER DEFAULT 0,
    imported_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: invitation_logs
CREATE TABLE invitation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    message_type message_type NOT NULL,
    channel message_channel NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status message_status DEFAULT 'sent',
    provider_message_id TEXT
);

-- Create indexes for performance
CREATE INDEX idx_events_slug ON events(slug);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_created_by ON events(created_by);
CREATE INDEX idx_ticket_tiers_event_id ON ticket_tiers(event_id);
CREATE INDEX idx_contacts_event_id ON contacts(event_id);
CREATE INDEX idx_contacts_email ON contacts(event_id, LOWER(email));
CREATE INDEX idx_tickets_event_id ON tickets(event_id);
CREATE INDEX idx_tickets_tier_id ON tickets(tier_id);
CREATE INDEX idx_tickets_contact_id ON tickets(contact_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_ticket_code ON tickets(ticket_code);
CREATE INDEX idx_tickets_attendee_email ON tickets(event_id, tier_id, attendee_email);
CREATE INDEX idx_tickets_attendee_phone ON tickets(event_id, tier_id, attendee_phone);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_email ON team_members(email);
CREATE INDEX idx_csv_imports_event_id ON csv_imports(event_id);
CREATE INDEX idx_invitation_logs_event_id ON invitation_logs(event_id);
CREATE INDEX idx_invitation_logs_contact_id ON invitation_logs(contact_id);

-- Enable Row Level Security on all tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events
-- Public can read published events with link_active = true
CREATE POLICY "Public can view active published events"
    ON events FOR SELECT
    USING (is_published = TRUE AND link_active = TRUE);

-- Team members can read all events
CREATE POLICY "Team members can view all events"
    ON events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.user_id = auth.uid()
        )
    );

-- Only admins and helpers can insert events
CREATE POLICY "Team members can create events"
    ON events FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.user_id = auth.uid()
        )
    );

-- Only admins and helpers can update events
CREATE POLICY "Team members can update events"
    ON events FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.user_id = auth.uid()
        )
    );

-- Only admins can delete events
CREATE POLICY "Admins can delete events"
    ON events FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.user_id = auth.uid()
            AND team_members.role = 'admin'
        )
    );

-- RLS Policies for ticket_tiers
-- Public can read tiers for published events
CREATE POLICY "Public can view tiers for active events"
    ON ticket_tiers FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM events
            WHERE events.id = ticket_tiers.event_id
            AND events.is_published = TRUE
            AND events.link_active = TRUE
        )
    );

-- Team members can manage tiers
CREATE POLICY "Team members can manage tiers"
    ON ticket_tiers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.user_id = auth.uid()
        )
    );

-- RLS Policies for contacts
-- Only team members can access contacts
CREATE POLICY "Team members can manage contacts"
    ON contacts FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.user_id = auth.uid()
        )
    );

-- RLS Policies for tickets
-- Public can read their own tickets (by ticket_code)
CREATE POLICY "Public can view own tickets"
    ON tickets FOR SELECT
    USING (TRUE); -- Will be filtered by ticket_code in application logic

-- Public can create tickets (for RSVP/checkout)
CREATE POLICY "Public can create tickets"
    ON tickets FOR INSERT
    WITH CHECK (TRUE);

-- Team members can manage all tickets
CREATE POLICY "Team members can manage tickets"
    ON tickets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.user_id = auth.uid()
        )
    );

-- RLS Policies for team_members
-- Team members can view all team members
CREATE POLICY "Team members can view team"
    ON team_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.user_id = auth.uid()
        )
    );

-- Only admins can manage team members
CREATE POLICY "Admins can manage team"
    ON team_members FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.user_id = auth.uid()
            AND team_members.role = 'admin'
        )
    );

-- RLS Policies for csv_imports
-- Team members can manage imports
CREATE POLICY "Team members can manage imports"
    ON csv_imports FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.user_id = auth.uid()
        )
    );

-- RLS Policies for invitation_logs
-- Team members can view logs
CREATE POLICY "Team members can view invitation logs"
    ON invitation_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.user_id = auth.uid()
        )
    );

-- Team members can create logs (when sending invitations)
CREATE POLICY "Team members can create invitation logs"
    ON invitation_logs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.user_id = auth.uid()
        )
    );
