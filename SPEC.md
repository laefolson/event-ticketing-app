# Barn Event Center — App Specification

> **Living document.** Update this file whenever a feature is added, changed, or removed.
> Claude Code instruction: _"Implement [feature] and update SPEC.md to reflect what was built."_

---

## Changelog

| Version | Date | Summary |
|---------|------|---------|
| 1.1 | Feb 2026 | Initial spec. Multiple CSV uploads, TOTP MFA, configurable invitation channels, post-event thank-you + archive, per-tier ticket limits, Phase 1 printable ticket card. |
| 1.2 | Mar 2026 | Add customizable host bio section headline per event. |
| 1.3 | Mar 2026 | Add save-the-date feature: per-event image/text, email + SMS sending, SaveTheDateEmail template, `save_the_date` message type, wizard updated to 6 steps. |
| 1.4 | Mar 2026 | Add SMS opt-in columns (event updates + marketing) and CSV export to attendees tab. |

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Color System](#3-color-system)
4. [User Roles](#4-user-roles)
5. [Database Schema](#5-database-schema)
6. [Routes](#6-routes)
7. [Features](#7-features)
8. [Message Templates](#8-message-templates)
9. [Stripe Integration](#9-stripe-integration)
10. [Authentication & Security](#10-authentication--security)
11. [Environment Variables](#11-environment-variables)
12. [Phase 2 Backlog](#12-phase-2-backlog)
13. [Implementation Notes](#13-implementation-notes)

---

## 1. Overview

A full-stack web app for a private barn event center to create, manage, and archive events (farm-to-table dinners, concerts, movie nights, etc.). Core capabilities:

- Admin dashboard to create and manage events
- Unique private landing page per event (invite-only URL)
- Guest contact management via CSV upload (multiple files per event)
- Email and SMS invitations with configurable per-contact channel
- Ticketing: free RSVP or paid via Stripe Checkout
- Per-tier ticket limits per unique email or phone
- Phase 1 printable ticket card (name, event, tier, quantity)
- Post-event thank-you messages (email + SMS) and manual archive action
- Permanent event archive with full attendee and revenue history

---

## 2. Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js (App Router, TypeScript) |
| Hosting | Vercel |
| Database & Auth | Supabase (PostgreSQL + Row Level Security) |
| File Storage | Supabase Storage |
| Payments | Stripe Checkout + Webhooks |
| Email | Resend (React Email templates) |
| SMS | Twilio (Messaging Service) |
| Styling | Tailwind CSS + shadcn/ui |
| Admin Auth | Supabase Auth — email/password + TOTP MFA |
| Ticket (Phase 1) | html2canvas — printable ticket card as PNG |
| Wallet (Phase 2) | passkit-generator — Apple Wallet .pkpass |
| CSV Parsing | Papa Parse (server-side) |
| Date Handling | date-fns + date-fns-tz |
| Validation | Zod (server-side, all inputs) |

---

## 3. Color System

### Brand Colors

| Token                  | Hex       | Usage                                      |
|------------------------|-----------|--------------------------------------------|
| `--color-primary`      | `#f1e5bc` | Buttons, active nav, primary actions       |
| `--color-primary-light`| `#fdf9f0` | Card backgrounds, input focus rings        |
| `--color-primary-mid`  | `#d4c07a` | Hover states on primary elements           |
| `--color-primary-dark` | `#a08835` | Pressed states, text on light primary bg   |
| `--color-primary-deep` | `#633806` | Headings, logo text                        |
| `--color-sky`          | `#d8e9f3` | Info banners, ticket tier highlights       |
| `--color-sky-dark`     | `#5597bb` | Links, info text                           |
| `--color-accent`       | `#f3bbb1` | CTAs, checkout button, sold-out badges     |
| `--color-accent-dark`  | `#b84e3a` | Hover on accent elements                   |
| `--color-sage`         | `#bad1b1` | Event banners, featured callouts           |
| `--color-sage-dark`    | `#4e7a44` | Text on sage backgrounds                   |

### Neutrals

| Token                       | Hex       | Usage                          |
|-----------------------------|-----------|--------------------------------|
| `--color-bg-page`           | `#f7f5ef` | Page background                |
| `--color-bg-surface`        | `#ffffff` | Cards, modals, inputs          |
| `--color-border`            | `#e8e5da` | Card borders, dividers         |
| `--color-text-primary`      | `#2c2a24` | Body text, headings            |
| `--color-text-secondary`    | `#5f5c55` | Labels, metadata, placeholders |
| `--color-text-muted`        | `#b4b2a9` | Disabled states, hints         |

### Status Colors

| Token                    | Light       | Base      | Dark      | Usage                        |
|--------------------------|-------------|-----------|-----------|------------------------------|
| Success                  | `#eaf3de`   | `#639922` | `#27500a` | Confirmed tickets, paid      |
| Warning                  | `#faeeda`   | `#ba7517` | `#633806` | Low availability, expiring   |
| Error                    | `#fcebeb`   | `#e24b4a` | `#791f1f` | Failed payment, validation   |

---

## 4. User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access to all routes and data, including team management and settings |
| **Helper** | Access to events, contacts, attendees, post-event page. No access to `/admin/team` or `/admin/settings` |
| **Guest** | No login. Accesses event via private URL only. Can RSVP or purchase tickets |

---

## 5. Database Schema

RLS must be enabled on all tables.

### `events`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| title | text | not null |
| slug | text | unique; kebab-case + 6 random chars (e.g. `harvest-dinner-x7k2m9`) |
| event_type | enum | `dinner \| concert \| movie_night \| other` |
| description | text | markdown supported |
| date_start | timestamptz | |
| date_end | timestamptz | |
| location_name | text | e.g. "The Barn at [Farm Name]" |
| location_address | text | |
| capacity | integer | max total attendees across all tiers |
| is_published | boolean | default false |
| cover_image_url | text | Supabase Storage URL |
| gallery_urls | text[] | up to 6 additional images |
| host_bio | text | pre-fillable from settings default |
| host_bio_headline | text | nullable; custom heading for host bio section on public page (e.g. "About the Band"); defaults to "About the Host" when null |
| save_the_date_image_url | text | nullable; optional image used in save-the-date emails |
| save_the_date_text | text | nullable; optional custom body text for save-the-date messages |
| faq | jsonb | array of `{question, answer}` |
| status | enum | `draft \| published \| archived` |
| social_sharing_enabled | boolean | default false; show/hide social share buttons on public page |
| link_active | boolean | default true; set false on archive to 404 public page |
| archived_at | timestamptz | set when admin manually archives |
| created_by | uuid | fk → auth.users |
| created_at | timestamptz | default now() |

### `ticket_tiers`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| event_id | uuid | fk → events |
| name | text | e.g. "Adult", "Child", "General Admission", "VIP" |
| description | text | |
| price_cents | integer | 0 = free |
| quantity_total | integer | max tickets available for this tier |
| quantity_sold | integer | default 0 |
| max_per_contact | integer | nullable; max tickets per unique email or phone; null = unlimited |
| stripe_price_id | text | nullable for free tiers |
| sort_order | integer | |

### `contacts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| event_id | uuid | fk → events; contacts scoped per event |
| first_name | text | |
| last_name | text | |
| email | text | |
| phone | text | E.164 format preferred |
| invitation_channel | enum | `email \| sms \| both \| none`; default logic: both fields → both; email only → email; phone only → sms |
| invited_at | timestamptz | |
| csv_source | text | filename of originating CSV upload |
| imported_at | timestamptz | |

### `tickets`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| event_id | uuid | fk → events |
| tier_id | uuid | fk → ticket_tiers |
| contact_id | uuid | fk → contacts; nullable for walk-ins or direct purchasers |
| attendee_name | text | |
| attendee_email | text | |
| attendee_phone | text | |
| ticket_code | text | unique short code; displayed as text or QR (per-event toggle) |
| quantity | integer | default 1; number of people this ticket covers |
| stripe_payment_intent_id | text | nullable for free |
| stripe_session_id | text | |
| amount_paid_cents | integer | |
| status | enum | `pending \| confirmed \| checked_in \| cancelled \| refunded` |
| checked_in_at | timestamptz | |
| purchased_at | timestamptz | |

### `team_members`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| user_id | uuid | fk → auth.users |
| role | enum | `admin \| helper` |
| name | text | |
| email | text | |
| mfa_enabled | boolean | default false; tracked for audit |
| invited_at | timestamptz | |

### `csv_imports`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| event_id | uuid | fk → events |
| filename | text | original uploaded filename |
| storage_path | text | Supabase Storage path |
| row_count | integer | total rows in file |
| imported_count | integer | rows successfully imported |
| skipped_count | integer | duplicates or invalid rows |
| imported_by | uuid | fk → auth.users |
| imported_at | timestamptz | |

### `sms_consents`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| phone | text | not null; phone number that consented |
| consent_type | text | `event_updates` or `marketing` |
| consent_text | text | exact checkbox label the user agreed to |
| ip_address | text | IP at time of consent |
| event_id | uuid | fk → events (on delete set null) |
| consented_at | timestamptz | default now() |

RLS: service-role only (records written server-side during checkout).

### `invitation_logs`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| event_id | uuid | fk → events |
| contact_id | uuid | fk → contacts |
| message_type | enum | `invitation \| thank_you \| save_the_date` |
| channel | enum | `email \| sms` |
| sent_at | timestamptz | |
| status | enum | `sent \| delivered \| failed \| bounced` |
| provider_message_id | text | Resend or Twilio message ID |

---

## 6. Routes

### Public (no auth)

| Route | Description |
|-------|-------------|
| `/e/[slug]` | Event landing page; returns 404 if `link_active = false` |
| `/e/[slug]/rsvp` | Free event RSVP form |
| `/e/[slug]/checkout` | Stripe Checkout redirect handler |
| `/e/[slug]/confirm` | Post-purchase/RSVP confirmation with printable ticket card |

### Webhooks (no auth — signature-verified)

| Route | Description |
|-------|-------------|
| `/api/webhooks/stripe` | Stripe payment events (checkout completed, refund, session expired) |
| `/api/webhooks/resend` | Resend email delivery status (delivered, bounced, complained) — Svix signature verification |
| `/api/webhooks/twilio` | Twilio SMS delivery status (delivered, undelivered, failed) — Twilio request signature verification |

### Admin (auth + MFA required)

| Route | Description |
|-------|-------------|
| `/admin` | Dashboard — upcoming events, quick stats |
| `/admin/events` | All events (draft, published, archived) |
| `/admin/events/new` | Create event wizard |
| `/admin/events/[id]` | Edit event details |
| `/admin/events/[id]/tiers` | Manage ticket tiers, pricing, per-tier limits |
| `/admin/events/[id]/contacts` | Upload CSVs, configure channels, send invitations |
| `/admin/events/[id]/attendees` | Attendee list and manual check-in |
| `/admin/events/[id]/post-event` | Send thank-you messages and archive event |
| `/admin/archive` | All archived events |
| `/admin/archive/[id]` | Archived event detail — attendees, revenue, stats |
| `/admin/team` | Manage team members (admin only) |
| `/admin/settings` | Venue name (used in email headers/footers), integration status (Stripe, Twilio, Resend — read-only, managed via env vars), default host bio (admin only) |

---

## 7. Features

### 6.1 Event Creation Wizard

Multi-step wizard at `/admin/events/new`. A cancel button is available on every step; clicking it shows a confirmation dialog before discarding progress and returning to the events list.

**Step 1 — Basics:** title, event type, date/time (start + end), capacity

**Step 2 — Details:** markdown description, location name + address, cover image, up to 6 gallery photos, host bio section headline (defaults to "About the Host"; customizable per event, e.g. "About the Band"), host bio (pre-fillable from settings default)

**Step 3 — Save the Date:** optional save-the-date image upload (`save_the_date_image_url`) and custom text (`save_the_date_text`); used when sending save-the-date messages before invitations (see §6.10)

**Step 4 — Ticket Tiers:**
- Toggle: Free vs. Paid
- Each tier: name, price, quantity, description, `max_per_contact` (optional)
- Paid tiers: auto-create Stripe Product + Price on save; store `stripe_price_id`
- Free events: single RSVP tier, no Stripe
- Tier `quantity_total` is validated against event `capacity` on create and update — total across all tiers cannot exceed capacity. Events with unlimited capacity (null) skip this validation.

**Step 5 — Landing Page Content:** FAQ pairs (add/remove/reorder), preview mode

**Step 6 — Review & Publish:** summary of all details; Save as Draft or Publish (`link_active = true`)

---

### 6.2 Public Event Landing Page

- Not search-indexed (`noindex` meta tag)
- Returns 404 if `link_active = false`
- Sections: hero (cover image, title, date, location), description, tier cards, map, host bio (heading from `host_bio_headline` or "About the Host"), FAQ accordion, social share buttons
- Tier cards show price, description, quantity remaining, and limit notice if `max_per_contact` is set
- Sold out state when `quantity_sold = quantity_total`
- Sticky footer CTA: "Get Tickets" or "RSVP Now"

---

### 6.3 Ticketing & Payment Flow

**Paid events:**
1. Guest selects tier + quantity
2. Server validates `max_per_contact`: query `SUM(quantity)` in tickets for this tier by email/phone; reject if limit exceeded
3. Redirect to Stripe Checkout
4. On `checkout.session.completed` webhook: create confirmed ticket records, send confirmation email
5. Redirect to `/e/[slug]/confirm`

**Free events:**
1. Guest submits name, email, phone on RSVP form
2. Server validates `max_per_contact`
3. Create ticket with `status = confirmed`, `amount_paid_cents = 0`
4. Redirect to confirm page

**Confirmation page (`/e/[slug]/confirm`):**
- Printable ticket card rendered as a styled React component containing:
  - Event cover image / logo
  - Event name, date, location
  - Attendee name
  - Tier name and quantity
  - Ticket code (text code or QR code based on per-event `ticket_qr_enabled` toggle)
  - QR code encodes verification URL: `/e/[slug]/verify/[ticket_code]`
- "Download Ticket" button — generates PDF via `@react-pdf/renderer`
- _(Phase 2: Apple Wallet button)_

---

### 6.4 Contact Management & CSV Import

- Multiple CSV uploads per event from different sources
- Each upload tracked in `csv_imports` (filename, rows imported, rows skipped)
- **Required columns:** `first_name`, `last_name`, plus at least one of `email` or `phone`
- **Optional column:** `invitation_channel` — if absent, defaults based on available fields
- Deduplication by email (case-insensitive) within the same event; phone for email-less contacts
- Import summary shown after each upload
- Admin can view full merged contact list with invitation status per contact

**Channel configuration:**
- Default: email only → `email`; phone only → `sms`; both → `both`
- Admin can override channel per contact or bulk-reassign

---

### 6.5 Invitation Sending

From `/admin/events/[id]/contacts`:

**Email (Resend):**
- Sends only to contacts where `invitation_channel` is `email` or `both`
- Scope options: all eligible | un-invited only | selected contacts
- Personalized with `first_name`; includes event details and CTA button
- Logged in `invitation_logs`

**SMS (Twilio):**
- Sends only to contacts where `invitation_channel` is `sms` or `both`
- Message: `"[first_name], you're invited to [Event Title] on [Date]! [URL]"`
- Scope options: all eligible | un-invited only | selected contacts
- Logged in `invitation_logs`

**Delivery Status Tracking:**
- `invitation_logs.status` starts as `sent` (or `failed` on immediate error)
- Resend webhook updates email status to `delivered` or `bounced` (including spam complaints)
- Twilio status callback updates SMS status to `delivered` or `failed`
- Archive detail page uses delivery status for invitation stats

---

### 6.6 Delete Event

Available on the Details tab (`/admin/events/[id]`) in a "Danger Zone" section for any event status.

- Admin clicks "Delete Event" → confirmation dialog requires typing the event title to confirm
- Permanently deletes: tickets, ticket tiers (CASCADE), contacts, CSV imports, invitation logs, and storage files
- Cleans up all files under `event-assets/{eventId}/` in Supabase Storage
- Redirects to `/admin/events` on success
- **Not reversible** — all event data is permanently removed from the database

---

### 6.7 Post-Event Actions

Available at `/admin/events/[id]/post-event` once `date_end` has passed.

**Thank-you messages:**
- Send to all confirmed/attended ticket holders
- Email: customizable body; defaults to "Thank you for joining us at [Event]..."
- SMS: `"Thank you for attending [Event Title]! Hope to see you next time."`
- Channel follows each contact's `invitation_channel` setting
- Preview before sending; logged with `message_type = thank_you`

**Archiving:**
- Admin clicks "Archive Event"
- Sets: `status = archived`, `link_active = false`, `archived_at = now()`
- Public landing page immediately returns 404
- Event remains fully visible in `/admin/archive`
- Reversible: admin can reactivate by setting `link_active = true`, `status = published`

---

### 6.8 Attendee Check-In

Optional — most events run on honor system; check-in is not required.

- Searchable list of confirmed tickets by name or email
- Manual check-in toggle per attendee (sets `status = checked_in`)
- Walk-in mode: create ticket manually (name, email, tier)
- Live counter: X checked in / Y expected
- **SMS opt-in columns:** two inline columns show whether each attendee opted in to SMS event updates and/or marketing (matched by normalized phone number against `sms_consents` records)
- **Export CSV:** downloads full attendee list as `attendees-export.csv` with columns: Name, Email, Phone, Tier, Qty, Amount Paid, Status, Purchased, SMS Event Opt-In, SMS Marketing Opt-In

> Phase 2: QR code scanning via device camera

---

### 6.9 Event Archive

- `/admin/archive`: all archived events, sorted by date descending
- Per-event archive page shows:
  - Tickets sold per tier, total revenue
  - Attendance count (checked_in vs confirmed)
  - Full attendee list: name, email, tier, quantity, amount paid, check-in status
  - Invitation stats (emails sent, SMS sent, delivery status)
  - Thank-you message stats
  - CSV import history
- Export full attendee list as CSV
- Cover image and event details preserved permanently

---

### 6.10 Save the Date

Admins can send save-the-date messages to contacts before formal invitations are sent. This is useful for early awareness — letting guests know an event is coming without providing the full invitation link yet.

**Configuration (per event):**
- `save_the_date_image_url` — optional image displayed in the save-the-date email (uploaded via the wizard or event edit page)
- `save_the_date_text` — optional custom body text; if blank, a default message is used

**Sending (from `/admin/events/[id]/contacts`):**

- **Email (Resend):**
  - Sends to contacts where `invitation_channel` is `email` or `both`
  - From name: "Blue Barn Events"
  - Uses the `SaveTheDateEmail` template (see §7)
  - Personalized with `first_name`; includes event title, date, and optional image
  - Scope options: all eligible | selected contacts

- **SMS (Twilio):**
  - Sends to contacts where `invitation_channel` is `sms` or `both`
  - Message: `"Save the date! {Event Title} on {Date}. More details coming soon."`
  - Scope options: all eligible | selected contacts

**Logging:**
- Each message logged to `invitation_logs` with `message_type = 'save_the_date'`
- Does **not** update `contacts.invited_at` — that field is reserved for formal invitations only

---

## 8. Message Templates

All email templates built in **Resend React Email** format. Must be responsive and include the configurable venue name (from `/admin/settings`) in header and footer.

| Template | Channel | Trigger |
|----------|---------|---------|
| SaveTheDateEmail | Email | Admin sends save-the-date from contacts page |
| Save the Date | SMS | Admin sends save-the-date from contacts page |
| Invitation | Email | Admin sends invitation |
| Invitation | SMS | Admin sends invitation |
| RSVP Confirmation | Email | Guest completes free RSVP |
| Ticket Confirmation | Email | Stripe `checkout.session.completed` |
| Thank-You | Email | Admin sends from post-event page |
| Thank-You | SMS | Admin sends from post-event page |
| Reminder | Email | _(Phase 2)_ 48hrs before event |

---

## 9. Stripe Integration

- Use **Stripe Checkout** (hosted) for PCI compliance
- On tier creation with `price_cents > 0`: auto-create Stripe Product + Price; store `stripe_price_id`
- Before creating Checkout Session: validate `max_per_contact` server-side
- Checkout Session metadata: `event_id`, `tier_id(s)`, `quantities`, `attendee_email`
- `success_url`: `/e/[slug]/confirm?session_id={CHECKOUT_SESSION_ID}`
- `cancel_url`: `/e/[slug]`

**Webhooks to handle:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create confirmed ticket records; send confirmation email |
| `charge.refunded` | Update ticket status to `refunded` |

- Validate `Stripe-Signature` header on every webhook request using `constructEvent`

---

## 10. Authentication & Security

### Admin Auth — TOTP MFA

- Supabase Auth: email + password login
- **MFA is mandatory** for all admin and helper accounts
- First login: redirect to MFA enrollment page → display QR code → user scans with authenticator app (Google Authenticator, Authy, etc.) → verify 6-digit code to complete enrollment
- Every subsequent login: email + password → TOTP code
- Supabase API: `supabase.auth.mfa.enroll()` and `supabase.auth.mfa.verify()`
- Middleware checks `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` returns `aal2` on all `/admin` routes
- New team members: admin invites via `/admin/team` → email invitation link → first click: set password + enroll MFA

### Roles & Permissions

- Roles in `team_members`, enforced via Supabase RLS
- Admin: full access
- Helper: `/admin/events/*`, `/admin/archive` (read-only); blocked from `/admin/team` and `/admin/settings`

### Public Page Security

- `noindex` meta tag on all event landing pages
- Slugs include 6-character random suffix (non-guessable)
- `link_active = false` → immediate 404 on public page

### General

- All admin routes protected by Supabase session middleware
- Stripe webhook: validate `Stripe-Signature` header
- CSV uploads: server-side validation — `.csv` only, max 5MB
- All inputs validated with Zod on the server
- No self-signup; all accounts created by admin invitation

---

## 11. Environment Variables

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |
| `STRIPE_SECRET_KEY` | Server only |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-safe |
| `RESEND_API_KEY` | |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `events@yourdomain.com` |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret from Resend webhook config |
| `TWILIO_ACCOUNT_SID` | |
| `TWILIO_AUTH_TOKEN` | |
| `TWILIO_MESSAGING_SERVICE_SID` | |
| `NEXT_PUBLIC_BASE_URL` | e.g. `https://events.yourdomain.com` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | For location map iframe (optional) |

---

## 12. Phase 2 Backlog

- [x] QR code image on ticket (per-event toggle; encodes verification URL)
- [ ] Apple Wallet `.pkpass` ticket generation with QR code
- [ ] QR scan check-in at the door via device camera
- [ ] Scheduled invitation sending (future date/time)
- [ ] Automated reminder emails 48hrs before event
- [ ] Waitlist — auto-notify on cancellation
- [ ] Recurring events / clone a past event as template
- [ ] Guest self-service: cancel or transfer ticket
- [ ] Promo codes / discounts
- [ ] Google Contacts or CRM sync for master contact list
- [ ] Custom subdomain (e.g. `events.yourfarm.com`)
- [ ] Event analytics dashboard (page views, conversion rate)

---

## 13. Implementation Notes

> For Claude Code / Cursor. Follow these conventions for a clean, production-ready codebase.

- **App Router only.** No Pages Router. All pages are Server Components where possible.
- **Supabase SSR.** Use `@supabase/ssr` for cookie-based auth in App Router.
- **MFA middleware.** After verifying session, check `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` returns `aal2` for all `/admin` routes. Redirect to MFA challenge if not.
- **Server Actions / Route Handlers** for all database mutations.
- **Zod** for all server-side input validation.
- **shadcn/ui** for all UI components (`npx shadcn@latest init`).
- **Dates.** Store all dates in UTC. Display in local time with `date-fns-tz`.
- **Slugs.** Generate as `kebab-case-title` + `-` + 6 random alphanumeric chars.
- **Ticket code.** Store as short code on creation. Display as plain text or QR code based on per-event `ticket_qr_enabled` toggle. QR encodes `/e/[slug]/verify/[ticket_code]` and is generated on-the-fly via the `qrcode` library.
- **Ticket card.** Built as a styled React component; PDF download via `@react-pdf/renderer`. QR code appears on confirmation page, PDF, and email when enabled.
- **CSV parsing.** Use Papa Parse server-side. Stream files > 1MB; don't load entirely into memory.
- **Multiple CSV uploads.** Process each file independently. Deduplicate against existing contacts for that event after each import.
- **`max_per_contact` enforcement.** Before creating a Stripe session or RSVP, query: `SELECT SUM(quantity) FROM tickets WHERE event_id = X AND tier_id = Y AND (attendee_email = Z OR attendee_phone = W) AND status != 'cancelled'`. Reject with a clear error if `sum + requested_quantity > max_per_contact`.
- **Stripe webhooks.** Use `stripe.webhooks.constructEvent()` for signature verification.
- **Storage buckets.** Use `event-assets` bucket. Images: public. CSVs: private, access via signed URLs only.
- **Error shape.** All server actions return `{ success: boolean, data?: T, error?: string }`. Never throw to client.
- **Post-event page.** Only render if `date_end < now()`. Show disabled/countdown state otherwise.
- **Archiving & Deletion.** The "Archive Event" action sets `link_active = false`. The "Delete Event" action permanently removes all event data. Do not auto-archive based on date without admin confirmation.
