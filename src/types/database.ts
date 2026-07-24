// Database types - these should match your Supabase schema
// Consider generating these from Supabase schema using supabase gen types

export type EventType = 'dinner' | 'concert' | 'movie_night' | 'other';
export type EventStatus = 'draft' | 'published' | 'archived';
export type InvitationChannel = 'email' | 'sms' | 'both' | 'none';
export type TicketStatus = 'pending' | 'confirmed' | 'checked_in' | 'cancelled' | 'refunded';
export type TeamRole = 'admin' | 'helper';
export type MessageType =
  | 'invitation'
  | 'thank_you'
  | 'save_the_date'
  | 'ticket_resend'
  | 'ticket_confirmation'
  | 'ticket_reminder'
  | 'event_update'
  | 'waitlist_custom';

export type TicketSource = 'public' | 'waitlist';

export type WaitlistStatus =
  | 'waiting'
  | 'offered'
  | 'purchased'
  | 'expired'
  | 'declined'
  | 'skipped';
export type MessageChannel = 'email' | 'sms';
export type MessageStatus = 'sent' | 'delivered' | 'failed' | 'bounced';
export type ContactSource = 'manual' | 'csv_import' | 'google_sheets' | 'checkout' | 'rsvp';
export type ContactAddedBy = 'csv_import' | 'google_sheets' | 'manual' | 'checkout' | 'rsvp' | 'event_copy';
export type PaymentMethod = 'stripe' | 'cash' | 'venmo' | 'paypal' | 'check' | 'comp' | 'other';

export interface Event {
  id: string;
  title: string;
  slug: string;
  event_type: EventType;
  description: string | null;
  date_start: string;
  date_end: string | null;
  start_time_label: string | null;
  additional_times: Array<{ label: string | null; time: string }>;
  location_name: string | null;
  location_address: string | null;
  capacity: number | null;
  is_published: boolean;
  cover_image_url: string | null;
  hide_title_on_hero: boolean;
  gallery_urls: string[];
  description_heading: string | null;
  video_url: string | null;
  faq: Array<{ question: string; answer: string }>;
  save_the_date_image_url: string | null;
  save_the_date_text: string | null;
  save_the_date_intro_text: string | null;
  save_the_date_sms_body: string | null;
  invitation_intro_text: string | null;
  invitation_image_url: string | null;
  invitation_after_image_text: string | null;
  invitation_sms_body: string | null;
  status: EventStatus;
  social_sharing_enabled: boolean;
  ticket_qr_enabled: boolean;
  venmo_enabled: boolean;
  venmo_handle: string;
  pass_service_fee: boolean;
  waitlist_enabled: boolean;
  waitlist_hold_hours: number;
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
  master_contact_id: string;
  invitation_channel: InvitationChannel;
  added_by: ContactAddedBy | null;
  invited_at: string | null;
  save_the_date_sent_at: string | null;
  created_at: string;
}

export interface MasterContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  sms_opt_in_event_updates: boolean;
  sms_opt_in_marketing: boolean;
  email_opt_out: boolean;
  source: ContactSource;
  notes: string | null;
  contributor_name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Contact row with the linked master_contacts embedded.
 * Returned by queries that use Supabase's foreign-key embed:
 *   .select('*, master_contacts!inner(first_name, last_name, email, phone, sms_opt_in_event_updates, sms_opt_in_marketing)')
 * Once the destructive migration drops the legacy contacts columns, this
 * embed becomes the only way to read name/email/phone from a contacts row.
 */
export interface ContactWithMaster extends Contact {
  master_contacts: Pick<
    MasterContact,
    'first_name' | 'last_name' | 'email' | 'phone' | 'sms_opt_in_event_updates' | 'sms_opt_in_marketing'
  >;
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
  service_fee_cents: number;
  payment_method: PaymentMethod;
  payment_note: string | null;
  status: TicketStatus;
  source: TicketSource;
  checked_in_at: string | null;
  purchased_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  refunded_at: string | null;
  refund_method: RefundMethod | null;
  refund_amount_cents: number | null;
  refund_note: string | null;
  stripe_refund_id: string | null;
  released_to_public: boolean;
}

/**
 * Channel used to return money to a cancelled attendee. Decoupled from the
 * original `payment_method` — a card purchase can be refunded via Venmo.
 * Only `'stripe'` triggers an actual Stripe API refund; the rest are records
 * of an out-of-band refund the admin handled manually.
 */
export type RefundMethod = 'stripe' | 'cash' | 'venmo' | 'paypal' | 'check' | 'other';

export interface WaitlistEntry {
  id: string;
  event_id: string;
  master_contact_id: string;
  position: number;
  tickets_requested: number;
  tickets_offered: number | null;
  tier_id: string | null;
  status: WaitlistStatus;
  offer_token: string | null;
  offer_expires_at: string | null;
  offered_at: string | null;
  purchased_at: string | null;
  created_at: string;
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
  error_code: string | null;
}

export interface SmsConsent {
  id: string;
  phone: string;
  consent_type: string;
  consent_text: string;
  ip_address: string;
  event_id: string | null;
  consented_at: string;
}
