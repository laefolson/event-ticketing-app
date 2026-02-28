# Barn Event Center — App Specification

> **Living document.** Update this file whenever a feature is added, changed, or removed.
> Claude Code instruction: _"Implement [feature] and update SPEC.md to reflect what was built."_

---

## Changelog

| Version | Date | Summary |
|---------|------|---------|
| 1.1 | Feb 2026 | Initial spec. Multiple CSV uploads, TOTP MFA, configurable invitation channels, post-event thank-you + archive, per-tier ticket limits, Phase 1 printable ticket card. |

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [User Roles](#3-user-roles)
4. [Database Schema](#4-database-schema)
5. [Routes](#5-routes)
6. [Features](#6-features)
7. [Message Templates](#7-message-templates)
8. [Stripe Integration](#8-stripe-integration)
9. [Authentication & Security](#9-authentication--security)
10. [Environment Variables](#10-environment-variables)
11. [Phase 2 Backlog](#11-phase-2-backlog)
12. [Implementation Notes](#12-implementation-notes)

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

## 3. User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access to all routes and data, including team management and settings |
| **Helper** | Access to events, contacts, attendees, post-event page. No access to `/admin/team` or `/admin/settings` |
| **Guest** | No login. Accesses event via private URL only. Can RSVP or purchase tickets |

---

## 4. Database Schema

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
| faq | jsonb | array of `{question, answer}` |
| status | enum | `draft \| published \| archived` |
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
| ticket_code | text | unique UUID; displayed as text in Phase 1; QR in Phase 2 |
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

### `invitation_logs`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| event_id | uuid | fk → events |
| contact_id | uuid | fk → contacts |
| message_type | enum | `invitation \| thank_you` |
| channel | enum | `email \| sms` |
| sent_at | timestamptz | |
| status | enum | `sent \| delivered \| failed \| bounced` |
| provider_message_id | text | Resend or Twilio message ID |

---

## 5. Routes

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

## 6. Features

### 6.1 Event Creation Wizard

Multi-step wizard at `/admin/events/new`:

**Step 1 — Basics:** title, event type, date/time (start + end), capacity

**Step 2 — Details:** markdown description, location name + address, cover image, up to 6 gallery photos, host bio (pre-fillable from settings default)

**Step 3 — Ticket Tiers:**
- Toggle: Free vs. Paid
- Each tier: name, price, quantity, description, `max_per_contact` (optional)
- Paid tiers: auto-create Stripe Product + Price on save; store `stripe_price_id`
- Free events: single RSVP tier, no Stripe

**Step 4 — Landing Page Content:** FAQ pairs (add/remove/reorder), preview mode

**Step 5 — Review & Publish:** summary of all details; Save as Draft or Publish (`link_active = true`)

---

### 6.2 Public Event Landing Page

- Not search-indexed (`noindex` meta tag)
- Returns 404 if `link_active = false`
- Sections: hero (cover image, title, date, location), description, tier cards, map, host bio, FAQ accordion, social share buttons
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
  - Ticket code (text only in Phase 1)
- "Download Ticket" button — renders card to PNG via html2canvas
- _(Phase 2: QR code image, Apple Wallet button)_

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

### 6.6 Post-Event Actions

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

### 6.7 Attendee Check-In

Optional — most events run on honor system; check-in is not required.

- Searchable list of confirmed tickets by name or email
- Manual check-in toggle per attendee (sets `status = checked_in`)
- Walk-in mode: create ticket manually (name, email, tier)
- Live counter: X checked in / Y expected

> Phase 2: QR code scanning via device camera

---

### 6.8 Event Archive

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

## 7. Message Templates

All email templates built in **Resend React Email** format. Must be responsive and include the configurable venue name (from `/admin/settings`) in header and footer.

| Template | Channel | Trigger |
|----------|---------|---------|
| Invitation | Email | Admin sends invitation |
| Invitation | SMS | Admin sends invitation |
| RSVP Confirmation | Email | Guest completes free RSVP |
| Ticket Confirmation | Email | Stripe `checkout.session.completed` |
| Thank-You | Email | Admin sends from post-event page |
| Thank-You | SMS | Admin sends from post-event page |
| Reminder | Email | _(Phase 2)_ 48hrs before event |

---

## 8. Stripe Integration

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

## 9. Authentication & Security

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

## 10. Environment Variables

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

## 11. Phase 2 Backlog

- [ ] QR code image on ticket (encode `ticket_code` as scannable QR)
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

## 12. Implementation Notes

> For Claude Code / Cursor. Follow these conventions for a clean, production-ready codebase.

- **App Router only.** No Pages Router. All pages are Server Components where possible.
- **Supabase SSR.** Use `@supabase/ssr` for cookie-based auth in App Router.
- **MFA middleware.** After verifying session, check `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` returns `aal2` for all `/admin` routes. Redirect to MFA challenge if not.
- **Server Actions / Route Handlers** for all database mutations.
- **Zod** for all server-side input validation.
- **shadcn/ui** for all UI components (`npx shadcn@latest init`).
- **Dates.** Store all dates in UTC. Display in local time with `date-fns-tz`.
- **Slugs.** Generate as `kebab-case-title` + `-` + 6 random alphanumeric chars.
- **Ticket code.** Store as UUID on creation. Display as plain text in Phase 1. Leave a commented `// TODO Phase 2: render QR image here` placeholder on the confirmation component.
- **Ticket card (Phase 1).** Build as a styled React component; use html2canvas to export as PNG. Keep the component clean for Phase 2 QR addition.
- **CSV parsing.** Use Papa Parse server-side. Stream files > 1MB; don't load entirely into memory.
- **Multiple CSV uploads.** Process each file independently. Deduplicate against existing contacts for that event after each import.
- **`max_per_contact` enforcement.** Before creating a Stripe session or RSVP, query: `SELECT SUM(quantity) FROM tickets WHERE event_id = X AND tier_id = Y AND (attendee_email = Z OR attendee_phone = W) AND status != 'cancelled'`. Reject with a clear error if `sum + requested_quantity > max_per_contact`.
- **Stripe webhooks.** Use `stripe.webhooks.constructEvent()` for signature verification.
- **Storage buckets.** Use `event-assets` bucket. Images: public. CSVs: private, access via signed URLs only.
- **Error shape.** All server actions return `{ success: boolean, data?: T, error?: string }`. Never throw to client.
- **Post-event page.** Only render if `date_end < now()`. Show disabled/countdown state otherwise.
- **Archiving.** The "Archive Event" action is the only thing that sets `link_active = false`. Do not auto-archive based on date without admin confirmation.
