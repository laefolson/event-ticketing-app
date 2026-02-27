// Database types - these should match your Supabase schema
// Consider generating these from Supabase schema using supabase gen types

export type EventType = 'dinner' | 'concert' | 'movie_night' | 'other';
export type EventStatus = 'draft' | 'published' | 'archived';
export type InvitationChannel = 'email' | 'sms' | 'both' | 'none';
export type TicketStatus = 'pending' | 'confirmed' | 'checked_in' | 'cancelled' | 'refunded';
export type TeamRole = 'admin' | 'helper';
export type MessageType = 'invitation' | 'thank_you';
export type MessageChannel = 'email' | 'sms';
export type MessageStatus = 'sent' | 'delivered' | 'failed' | 'bounced';

export interface Event {
  id: string;
  title: string;
  slug: string;
  event_type: EventType;
  description: string | null;
  date_start: string;
  date_end: string;
  location_name: string | null;
  location_address: string | null;
  capacity: number | null;
  is_published: boolean;
  cover_image_url: string | null;
  gallery_urls: string[];
  host_bio: string | null;
  faq: Array<{ question: string; answer: string }>;
  status: EventStatus;
  social_sharing_enabled: boolean;
  link_active: boolean;
  archived_at: string | null;
  created_by: string;
  created_at: string;
}

export interface TicketTier {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
  max_per_contact: number | null;
  stripe_price_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface Contact {
  id: string;
  event_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  invitation_channel: InvitationChannel;
  invited_at: string | null;
  csv_source: string | null;
  imported_at: string;
}

export interface Ticket {
  id: string;
  event_id: string;
  tier_id: string;
  contact_id: string | null;
  attendee_name: string;
  attendee_email: string | null;
  attendee_phone: string | null;
  ticket_code: string;
  quantity: number;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string | null;
  amount_paid_cents: number;
  status: TicketStatus;
  checked_in_at: string | null;
  purchased_at: string;
}

export interface TeamMember {
  id: string;
  user_id: string;
  role: TeamRole;
  name: string;
  email: string;
  mfa_enabled: boolean;
  invited_at: string;
}

export interface CsvImport {
  id: string;
  event_id: string;
  filename: string;
  storage_path: string;
  row_count: number;
  imported_count: number;
  skipped_count: number;
  imported_by: string | null;
  imported_at: string;
}

export interface InvitationLog {
  id: string;
  event_id: string;
  contact_id: string | null;
  message_type: MessageType;
  channel: MessageChannel;
  sent_at: string;
  status: MessageStatus;
  provider_message_id: string | null;
}
