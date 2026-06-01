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
| 1.5 | Mar 2026 | Fix all dates to display in Mountain Time (`America/Denver`) via shared `formatDate` helper. Add cover image hero to ticket confirmation email. |
| 1.6 | Apr 2026 | Add SMS opt-in checkboxes to free RSVP form (matching checkout). Add static `/sms-opt-in` disclosure page for A2P campaign registration. Add `/api/health` health check endpoint. |
| 1.7 | May 2026 | Master contact system. New `master_contacts` table; `contacts` becomes an event-contact join table (additive migration; destructive follow-up to drop the legacy columns is deferred until verified on prod). New `/admin/contacts` section with debounced search, opt-in/source/event filters, server-side pagination, slide-over add, editable detail with Event/Message history, CSV export. Bulk CSV import to master (shared helper used by both `/admin/contacts` and `/admin/events/[id]/contacts`), Google Sheets sync (Sheets API v4, public-link, mapping persisted), and "Add from Master List" on the event contacts tab (Search / Prior Event / Opt-In Status tabs + staging). Opt-in auto-sync from checkout (Stripe webhook) and free RSVP; opt-ins are never downgraded, phone numbers are normalized to `(xxx) xxx-xxxx` on every write. Side fix: replaced recursive `team_members` RLS that hit `42P17` with `is_team_admin()` / `is_team_member()` SECURITY DEFINER helpers, reused by the new `master_contacts` policies. |
| 1.8 | May 2026 | Destructive follow-up to the master contact transition: dropped legacy `contacts.first_name/last_name/email/phone/csv_source/imported_at`, locked `master_contact_id NOT NULL`. All event-scoped reads now embed `master_contacts!inner(…)`. Manual add/edit on the event contacts tab writes through the master (one contact, many events). Phone validation (`isValidPhone`) and normalization extended to every entry point — RSVP, paid checkout, walk-in, manual add — so ticket `attendee_phone` is also formatted on write. |
| 1.9 | May 2026 | Optional YouTube video embed per event (`events.video_url`, nullable). Admins paste a `youtube.com/watch?v=…` or `youtu.be/…` URL in the wizard or edit form; the public event page renders a responsive 16:9 `<iframe>` between the description and tickets when the URL parses. |
| 1.10 | May 2026 | Add Ticket flow (renamed from Walk-in). `tickets.payment_method` + `payment_note` columns. Admin records manual sales (Cash / Venmo / PayPal / Check / Other), comps, or reduced-price tickets and can deliver the ticket by email and/or SMS in the same submit. Master contact + per-event join row are synced via the shared helper with `source='manual'`. Attendees table gains a Payment column and archive event detail gains a Payment Breakdown card grouped by method. |
| 1.11 | May 2026 | `events.hide_title_on_hero` column — per-event toggle to suppress the title text overlay on the public hero image (sr-only `h1` kept for SEO/a11y). Public hero now uses an aspect-ratio container so the 1200×400 cover doesn't get top/bottom-cropped on wide browsers. Refunded tickets stay visible on the attendees tab (dimmed row + destructive "Refunded" badge, check-in disabled, excluded from the expected counter). Admin dashboard replaced its total-stats cards with two per-event lists (Upcoming + Past) showing tickets sold and revenue per row. Bug fixes: event datetimes are now stored in UTC after explicit Mountain Time conversion (was being parsed as server-local UTC on Vercel, shifting the displayed time by ~6h); manual Add Ticket now sets `ticket_code` explicitly so it doesn't fall through to a stale UUID DB default. |
| 1.12 | Jun 2026 | Event times rework: `events.date_end` is now nullable (events without a published end time hide the end portion); `start_time_label` lets the primary start time carry a label like "Reception"; new `additional_times` jsonb column stores extra labeled time slots on the same date (e.g. "Reception at 6 PM" + "Concert at 7 PM") rendered sorted by clock time on the public page. New `events.description_heading` field — admin types the heading rendered above the description on the public page (falls back to "Event Details"). Dropped `events.host_bio` and `events.host_bio_headline` and the matching `default_host_bio` app_settings row; admins fold bios into the description. Public event page polish: ticket price range moved from the hero overlay into the Event Details section, the YouTube embed moved below the gallery, tier cards are now clickable (non-sold-out ones link straight to checkout/RSVP). Admin date/time pickers replaced with a shadcn Calendar popover and the browser-native `<input type="time">`. |
| 1.13 | Jun 2026 | QR scan check-in at the door (Phase 2 backlog item now shipped). New **Scan** button on the attendees tab opens a camera viewfinder powered by `qr-scanner` that reads the ticket QR codes the app already emits for events with `ticket_qr_enabled`. A scan calls a new read-only `lookupTicketByCode` action and surfaces a confirmation prompt — attendee name, tier, and quantity in large type with mobile-sized **Cancel / Check In** buttons — so the door operator can confirm before flipping the row to `checked_in` via `checkInByCode`. Success shows a green banner and auto-resumes scanning; refunded / cancelled / pending / wrong-event / already-checked-in scans each get their own Got-it prompt with an explanatory message. Works on any modern mobile browser over HTTPS. |
| 1.14 | Jun 2026 | Per-event notification overrides. Six new optional columns on `events`: `save_the_date_intro_text`, `save_the_date_sms_body`, `invitation_intro_text`, `invitation_image_url`, `invitation_after_image_text`, `invitation_sms_body`. The blue banner on **all event-related emails** now shows `event.location_name` (falls back to the venue name). The **InvitationEmail** template drops its date/location box and instead renders a primary marketing image (from `invitation_image_url`, falling back to the event cover), optional intro override after the greeting, optional text below the image, and a dynamic button label — **"RSVP"** for free events (all tiers `price_cents = 0`) or **"View Event & Purchase Tickets"** for paid events. **SaveTheDateEmail** picks up the same intro override. SMS bodies for both message types are now per-event customizable too. Admin UX: new **Notifications** tab on the event detail page (between FAQ and Contacts) and a renamed step 3 in the create-event wizard ("Save the Date" → "Notifications") that hosts all of the new copy/image fields. The Save-the-Date section is removed from the Details edit form to consolidate. Inactivity session timeout dropped from 24h to 12h, and the `last_activity` cookie now uses `secure` only in production so it persists in local dev (where HTTP would otherwise drop a `Secure` cookie and never trigger the timeout). Email footer copyright switched to **Over Yonder, LLC**. |
| 1.15 | Jun 2026 | MMS support for save-the-date and invitation SMS. `sendSms` now accepts an optional `mediaUrl`; both senders pass the relevant image (save-the-date → `save_the_date_image_url`; invitation → `invitation_image_url ?? cover_image_url`). New `toMmsImageUrl` helper rewrites Supabase Storage public URLs to the `/render/image/public/` transform endpoint with `?width=800&quality=75` so attachments stay under MMS carrier limits (~600 KB). Requires Supabase image transformations to be enabled (Pro plan and above) — prod is on, dev is not, so dev MMS will arrive without an image. |

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
| date_start | timestamptz | not null; canonical primary start time (used for sorting, calendar, structured data) |
| date_end | timestamptz | nullable; optional end time. When unset the public page omits the end-time portion of the display. |
| start_time_label | text | nullable; optional label for the primary start time (e.g. "Reception", "Doors") rendered on the public page |
| additional_times | jsonb | array of `{label: string \| null, time: "HH:MM"}` for additional labeled time slots on the same event date (e.g. a 6 PM reception followed by a 7 PM concert). The date is implied by `date_start`'s date; sorted by clock time on the public page. |
| location_name | text | e.g. "The Barn at [Farm Name]" |
| location_address | text | |
| capacity | integer | max total attendees across all tiers |
| is_published | boolean | default false |
| cover_image_url | text | Supabase Storage URL |
| hide_title_on_hero | boolean | default false; when true, the public event page hides the title text overlay (and its dark gradient) on the hero image — for covers that already include the event/band name. A screen-reader-only h1 is still rendered for accessibility and SEO. |
| gallery_urls | text[] | up to 6 additional images |
| description_heading | text | nullable; customizes the heading rendered above the event description on the public page. Defaults to "Event Details" when null. (Replaces the dropped `host_bio` and `host_bio_headline` columns — bios now live in the description itself.) |
| save_the_date_image_url | text | nullable; optional image used in save-the-date emails |
| save_the_date_text | text | nullable; optional custom body text for save-the-date messages |
| video_url | text | nullable; optional YouTube URL (youtube.com/watch?v=… or youtu.be/…) rendered as a responsive 16:9 embed on the public event page |
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
| payment_method | text | enum-via-check: `stripe \| cash \| venmo \| paypal \| check \| comp \| other`; default `stripe`. Stripe checkout sets `stripe`; the Add Ticket admin flow sets cash/venmo/paypal/check/comp/other. |
| payment_note | text | nullable; admin free-text (Venmo handle, check #, comp reason) |
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
| `/sms-opt-in` | Static SMS opt-in disclosure page (for A2P campaign registration) |
| `/api/health` | Health check — returns 200 with timestamp when DB is reachable, 503 otherwise |

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
| `/admin/settings` | Venue name (used in email headers/footers), integration status (Stripe, Twilio, Resend — read-only, managed via env vars) — admin only |

---

## 7. Features

### 7.1 Event Creation Wizard

Multi-step wizard at `/admin/events/new`. A cancel button is available on every step; clicking it shows a confirmation dialog before discarding progress and returning to the events list.

**Step 1 — Basics:** title, event type, date/time (start + end), capacity

**Step 2 — Details:** description heading (optional, defaults to "Event Details"), markdown description, location name + address, cover image, up to 6 gallery photos, optional YouTube video URL

> **Cover image processing:** Uploaded cover images are automatically resized/cropped to 1200×400 (3:1 aspect ratio) using Sharp. Crop position is horizontally centered, vertically at 20% from top. Output format is WebP at quality 85. Gallery images are uploaded as-is.

**Step 3 — Save the Date:** optional save-the-date image upload (`save_the_date_image_url`) and custom text (`save_the_date_text`); used when sending save-the-date messages before invitations (see §7.10)

**Step 4 — Ticket Tiers:**
- Toggle: Free vs. Paid
- Each tier: name, price, quantity, description, `max_per_contact` (optional)
- Paid tiers: auto-create Stripe Product + Price on save; store `stripe_price_id`
- Free events: single RSVP tier, no Stripe
- Tier `quantity_total` is validated against event `capacity` on create and update — total across all tiers cannot exceed capacity. Events with unlimited capacity (null) skip this validation.

**Step 5 — Landing Page Content:** FAQ pairs (add/remove/reorder), preview mode

**Step 6 — Review & Publish:** summary of all details; Save as Draft or Publish (`link_active = true`)

---

### 7.2 Public Event Landing Page

- Not search-indexed (`noindex` meta tag)
- Returns 404 if `link_active = false`
- Sections: hero (cover image, title, date, location), description (heading from `description_heading` or "Event Details"), tier cards, gallery, optional YouTube video embed (16:9, rendered only when `video_url` is set and parseable), map, FAQ accordion, social share buttons
- Tier cards show price, description, quantity remaining, and limit notice if `max_per_contact` is set
- Sold out state when `quantity_sold = quantity_total`
- Sticky footer CTA: "Get Tickets" or "RSVP Now"

---

### 7.3 Ticketing & Payment Flow

**Paid events:**
1. Guest selects tier + quantity
2. Server validates `max_per_contact`: query `SUM(quantity)` in tickets for this tier by email/phone; reject if limit exceeded
3. Redirect to Stripe Checkout
4. On `checkout.session.completed` webhook: create confirmed ticket records, send confirmation email
5. Redirect to `/e/[slug]/confirm`

**Free events:**
1. Guest submits name, email, phone on RSVP form
2. If phone provided, optional SMS consent checkboxes appear (same as paid checkout)
3. Server validates `max_per_contact`
4. Create ticket with `status = confirmed`, `amount_paid_cents = 0`
5. Record `sms_consents` rows if opted in
6. Redirect to confirm page

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

### 7.4 Contact Management & CSV Import

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

### 7.5 Invitation Sending

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

### 7.6 Delete Event

Available on the Details tab (`/admin/events/[id]`) in a "Danger Zone" section for any event status.

- Admin clicks "Delete Event" → confirmation dialog requires typing the event title to confirm
- Permanently deletes: tickets, ticket tiers (CASCADE), contacts, CSV imports, invitation logs, and storage files
- Cleans up all files under `event-assets/{eventId}/` in Supabase Storage
- Redirects to `/admin/events` on success
- **Not reversible** — all event data is permanently removed from the database

---

### 7.7 Post-Event Actions

Available at `/admin/events/[id]/post-event` once `date_end` has passed.

**Thank-you messages:**
- Send to all confirmed/attended ticket holders
- Email: customizable body; defaults to "Thank you for joining us at [Event]...". Includes the event cover image as a hero at the top when available (same pattern used in Ticket Confirmation email).
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

### 7.8 Attendee Check-In

Optional — most events run on honor system; check-in is not required.

- Searchable list of confirmed tickets by name or email
- Manual check-in toggle per attendee (sets `status = checked_in`)
- **Add Ticket** (renamed from Walk-in): admin records a manual sale or comp. Inputs: tier, name, email and/or phone (at least one), quantity, amount paid, payment method (Cash / Venmo / PayPal / Check / Comp / Other) with auto-filled price from the tier × quantity and a "Comp" toggle that zeroes the amount and sets method to `comp`, optional payment note, and "Deliver via" Email/SMS checkboxes. Bypasses `max_per_contact` (admin override). On submit: inserts a confirmed ticket with the chosen `payment_method`/`payment_note`, increments `quantity_sold`, syncs master_contacts via the shared helper with `source='manual'`, sends the standard `TicketConfirmationEmail` when email delivery is selected, sends a short ticket SMS (`Your ticket for {event} on {date}: {code}. View: {url}`) when SMS delivery is selected, and logs each delivery to `invitation_logs` as `message_type='ticket_resend'`.
- Live counter: X checked in / Y expected
- **Payment column** on the attendees table shows the method + amount (e.g., `Venmo · $25`, `Comp`); the optional payment note is shown beneath the amount.
- **SMS opt-in columns:** two inline columns show whether each attendee opted in to SMS event updates and/or marketing (matched by normalized phone number against `sms_consents` records)
- **Export CSV:** downloads full attendee list as `attendees-export.csv` with columns: Name, Email, Phone, Tier, Qty, Amount Paid, Payment Method, Payment Note, Status, Purchased, SMS Event Opt-In, SMS Marketing Opt-In
- **Scan**: opens a camera viewfinder dialog (uses `qr-scanner`, rear camera preferred) that reads the ticket QR codes generated for events with `ticket_qr_enabled`. A scan calls `lookupTicketByCode` and shows a confirmation prompt with attendee name, tier, and quantity in large type plus mobile-sized **Cancel / Check In** buttons. Confirming runs `checkInByCode` (confirmed → checked_in), shows a green success banner, and resumes the camera for the next person. Refunded / pending / cancelled / wrong-event / already-checked-in scans each show their own prompt with a single Got-it button. A single QR represents a whole ticket row, so a `quantity = N` ticket checks in as N people in one scan; partial-row check-in isn't supported.

---

### 7.9 Event Archive

- `/admin/archive`: all archived events, sorted by date descending
- Per-event archive page shows:
  - Tickets sold per tier, total revenue
  - Payment breakdown by `payment_method` (rows for each of Stripe / Cash / Venmo / PayPal / Check / Comp / Other that have at least one ticket — count and revenue per method; the Comp row shows "—" for revenue)
  - Attendance count (checked_in vs confirmed)
  - Full attendee list: name, email, tier, quantity, amount paid, payment method/note, check-in status
  - Invitation stats (emails sent, SMS sent, delivery status)
  - Thank-you message stats
  - CSV import history
- Export full attendee list as CSV
- Cover image and event details preserved permanently

---

### 7.10 Save the Date

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

### 7.11 Master Contact System

> Version 1.7 addition. Replaces per-event-only contact management with a
> global master contact list. Per-event contacts become a join between
> master_contacts and events.

> **Implementation status:**
> - **Phase 1 — Database (additive):** implemented in `supabase/migrations/20260530100000_master_contacts_additive.sql` and applied to dev. The original `contacts.first_name/last_name/email/phone/csv_source/imported_at` columns are intentionally retained alongside the new join-table columns; a follow-up destructive migration will drop them after data verification on production. Prerequisite RLS fix `supabase/migrations/20260530090000_fix_team_members_rls.sql` was applied first to resolve `42P17` infinite-recursion on `team_members` and to introduce the `is_team_member()` / `is_team_admin()` SECURITY DEFINER helpers, which the new `master_contacts` policies reuse.
> - **Phase 2 — Master Contacts page:** implemented at `/admin/contacts` (list with debounced search, SMS-event/SMS-marketing/source/event-attended filters, server-side 50-per-page pagination) and `/admin/contacts/[id]` (editable Contact Info, Event History via `contacts` join with role derived from `tickets`, Message History via `invitation_logs`). Manual add uses a slide-over panel (shadcn `Sheet`). CSV export at `/admin/contacts/export` honors the active filters. Server actions in `src/app/admin/contacts/actions.ts` use Zod validation. Import CSV and Sync Google Sheet buttons are deferred to phases 3 and 5.
> - **Phase 3 — CSV import to master list:** shared helper `src/lib/master-contacts-import.ts` upserts master_contacts by lowercased email, enforces "never downgrade a true opt-in to false," and tracks per-row outcomes plus opt-in promotion counts. Used by `/admin/contacts` Import CSV dialog (master-only) and refactored event-scoped `importContacts` in `/admin/events/[id]/contacts`. Event-scoped flow now upserts master first, then creates `contacts` join rows for masters not yet linked; legacy `contacts.first_name/last_name/email/phone/csv_source` columns are still populated during the transitional period. Result modals show `added / matched / skipped` and, when > 0, `SMS event-update opt-ins added` / `SMS marketing opt-ins added`. CSV email column is now required (phone-only rows are skipped) — this is a behavior change from the pre-v1.7 event-scoped import.
> - **Phase 4 — Add from Master List:** slide-over on `/admin/events/[id]/contacts` with three tabs (Search & Select, By Prior Event, By Opt-In Status), per-contact checkboxes, persistent staging area with removable chips across tab switches, batch invitation-channel select (email / sms / both), and a single "Add N to event" action. Already-linked contacts are disabled with an "Already in event" badge; the Opt-In tab additionally excludes them from results outright. Per-contact `added_by` is recorded as `manual` from Search/Opt-In and `event_copy` from By Prior Event. Server actions in `src/app/admin/events/[id]/contacts/actions.ts`: `searchMasterContactsForEvent`, `getMasterContactsForPriorEvent`, `getMasterContactsByOptIn`, `addMasterContactsToEvent`.
> - **Phase 5 — Google Sheets sync:** Sync Google Sheet button on `/admin/contacts`. Multi-step Dialog (URL → mapping → preview → apply → done) calls Google Sheets API v4 with `GOOGLE_SHEETS_API_KEY` against public-link sheets (no OAuth). Auto-detects mapping from common header variants; remembers the URL + mapping in `app_settings.google_sheets_sync` after a successful apply. Preview is a dry-run via `processMasterContactsCsv({ dryRun: true })` and shows `added · matched · skipped` plus opt-in promotions. Master writes use `source = 'google_sheets'`. Shared phone normalization (`src/lib/phone.ts`) formats US 10/11-digit numbers as `(xxx) xxx-xxxx` on all writes to master and the contacts join, leaving international/partial numbers untouched. Phone update rule was loosened from "only if blank" to "always update when source provides a different value" — the spreadsheet is the source of truth.
> - **Phase 6 — Opt-in sync from checkout and RSVP:** shared helper `src/lib/checkout-master-sync.ts` upserts `master_contacts` by lowercased email, fills blank name fields, treats source-provided phone as authoritative (overwrite when different), and upgrades opt-ins false→true without ever downgrading true→false. After the master is in place it creates the per-event `contacts` join row (silent no-op if one already exists) with `added_by = 'checkout'` or `'rsvp'`, normalized phone in the legacy columns, and an opt-in-aware `invitation_channel` (defaults to `'both'` only when the buyer opted in to SMS event-updates AND provided a phone; otherwise `'email'`). Called from `src/app/api/webhooks/stripe/route.ts` on `checkout.session.completed` (SMS opt-ins read from Stripe session metadata stashed by the checkout action) and from `src/app/e/[slug]/rsvp/actions.ts` after the ticket insert. Both call sites are best-effort: helper failures are logged but never fail the ticket / RSVP. The legacy "create a contact row if opted in to event updates" branch in the checkout action was removed — the webhook is now the single source of truth.

#### Overview

Contacts are now a first-class entity independent of events. A single
master_contacts record exists per person (deduplicated by email). Each
event has a contacts join table linking master_contacts to that event
with per-event invitation metadata. This enables cross-event contact
management, opt-in tracking, and Google Sheets sync.

---

#### Schema Changes

##### New Table: `master_contacts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key, default gen_random_uuid() |
| first_name | text | not null |
| last_name | text | not null |
| email | text | unique, not null |
| phone | text | nullable; E.164 format e.g. +14065550123 |
| sms_opt_in_event_updates | boolean | default false; consent to event-specific SMS |
| sms_opt_in_marketing | boolean | default false; consent to future event SMS |
| email_opt_out | boolean | default false; hard opt-out from all email |
| source | enum | `manual \| csv_import \| google_sheets \| checkout \| rsvp` |
| notes | text | nullable; internal admin notes |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now(); update via trigger |

RLS: authenticated users (admin/helper) can read and write.
Public: no access.

##### Modified Table: `contacts`

Becomes a join table between master_contacts and events.
Existing columns for name/email/phone are removed after migration.
New structure:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| event_id | uuid | fk → events, not null |
| master_contact_id | uuid | fk → master_contacts, not null |
| invitation_channel | enum | `email \| sms \| both`; per-event override of contact preference |
| added_by | enum | `csv_import \| google_sheets \| manual \| checkout \| rsvp \| event_copy` |
| invited_at | timestamptz | nullable; set when formal invitation sent |
| save_the_date_sent_at | timestamptz | nullable |
| created_at | timestamptz | default now() |

Unique constraint: (event_id, master_contact_id) — one record per
contact per event.

RLS: authenticated users only.

##### Migration Plan

Before schema changes, run the following migration in order:
1. Create master_contacts table
2. Insert one master_contacts row per unique email in existing contacts,
   taking first_name/last_name/phone from the most recent record
3. Set source = 'csv_import' for all migrated records
4. Add master_contact_id column to contacts table
5. Populate master_contact_id by matching on email
6. Drop name/email/phone columns from contacts (after verification)
7. Add unique constraint on (event_id, master_contact_id)
8. Update invitation_logs to join through master_contacts where needed

---

#### New Route: `/admin/contacts`

Top-level admin section for managing the master contact list.
Accessible to both admin and helper roles.

##### `/admin/contacts` — Master Contact List

**Layout:** Full-width data table with toolbar above.

**Toolbar:**
- Search input — filters by first_name, last_name, email, phone (debounced)
- Filter dropdown — SMS event updates opt-in: all | opted in | not opted in
- Filter dropdown — SMS marketing opt-in: all | opted in | not opted in
- Filter dropdown — Source: all | manual | csv_import | google_sheets | checkout | rsvp
- Filter dropdown — Event attended: all | [list of past events by title]
- Button: Add Contact (opens inline form or slide-over)
- Button: Import CSV
- Button: Sync Google Sheet
- Button: Export CSV (exports current filtered view)

**Table columns:**
- Name (first + last, links to contact detail)
- Email
- Phone
- SMS Event Updates (boolean badge: Opted In / —)
- SMS Marketing (boolean badge: Opted In / —)
- Events (count of events associated)
- Source
- Added (created_at date)
- Actions: Edit | Delete

**Pagination:** 50 per page, server-side.

**Empty state:** Friendly message with prompt to import CSV or
sync Google Sheet.

---

##### `/admin/contacts/[id]` — Contact Detail

**Sections:**

1. **Contact Info** (editable inline or via edit button)
   - First name, last name, email, phone
   - SMS opt-in event updates (toggle)
   - SMS opt-in marketing (toggle)
   - Email opt-out (toggle)
   - Source (read-only)
   - Notes (textarea)
   - Save button

2. **Event History**
   Table of all events this contact is associated with:
   - Event title
   - Event date
   - Role: Invitee | Attendee (has confirmed ticket) | RSVP
   - Ticket tier (if attendee)
   - Invitation channel used
   - Invited at date
   - Actions: Remove from event

3. **Message History**
   Table from invitation_logs for this contact across all events:
   - Event title
   - Message type (save_the_date | invitation | thank_you | reminder)
   - Channel (email | sms)
   - Sent at
   - Status (if available from webhook)

---

#### Google Sheets Sync

Allows the admin to pull contacts from a Google Sheet into master_contacts.
Designed to replace the Apple Contacts → CSV → upload workflow.

**Configuration (stored in settings or per-sync):**
- Google Sheet URL (public sheet with anyone-with-link read access)
- Column mapping (first_name, last_name, email, phone)

**Sync behavior:**
- Fetch rows from the sheet via Google Sheets API v4
- For each row: upsert into master_contacts by email
  - If email exists: update name/phone if blank, do not overwrite opt-ins
  - If email does not exist: insert with source = 'google_sheets'
- Show a preview modal before confirming:
  "X new contacts, Y updated, Z skipped (invalid email)"
- Log sync timestamp and result count

**Implementation approach:**
- Use Google Sheets API v4 with an API key (public sheets only)
- No OAuth required if the sheet is set to "anyone with link can view"
- Sheet URL parsed to extract sheet ID
- Fetch via:
  GET https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}
  ?key={GOOGLE_SHEETS_API_KEY}
- New env variable: GOOGLE_SHEETS_API_KEY
  (separate from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY —
  restrict this key to Sheets API only in Google Cloud Console)

**Column mapping UI:**
- After entering sheet URL, fetch the first row (headers)
- Display a mapping interface:
  "Which column is first name?" → dropdown of detected headers
- Save mapping for subsequent syncs

---

#### Add Contacts to Event From Master List

On `/admin/events/[id]/contacts`, add a new "Add from Master List"
button alongside the existing CSV upload. Opens a slide-over panel with:

**Tabs:**

1. **Search & Select**
   - Search by name, email, or phone
   - Results show name, email, opt-in status, events attended count
   - Checkbox select individual contacts
   - Shows "Already added to this event" badge for existing contacts

2. **By Prior Event**
   - Dropdown: select a past event
   - Shows count of contacts from that event
   - Option: All contacts from that event | Only attendees (confirmed ticket/RSVP)
   - Checkbox to filter: only those with SMS opt-in | only those with email

3. **By Opt-In Status**
   - Checkboxes: SMS event updates opted in | SMS marketing opted in
   - Excludes contacts already added to this event
   - Shows count of matching contacts

**Shared behavior across all tabs:**
- Selected contacts shown in a staging area at the bottom
- Set invitation_channel for the batch: email | sms | both
- "Add X contacts to event" confirm button
- Deduplication: skip contacts already in this event silently
- Added with added_by = 'manual' or 'event_copy' as appropriate

---

#### Opt-In Sync From Checkout and RSVP

When a guest completes checkout (Stripe webhook) or free RSVP:

1. Check master_contacts for existing record matching attendee_email
2. If found:
   - Update sms_opt_in_event_updates if guest opted in and it was false
   - Update sms_opt_in_marketing if guest opted in and it was false
   - Never downgrade an existing true opt-in to false via this flow
   - Update phone if currently blank and guest provided one
3. If not found:
   - Create new master_contacts record with source = 'checkout' or 'rsvp'
   - Set opt-in fields from checkout selections
4. Upsert a contacts join record linking this master_contact to the event
   with added_by = 'checkout' or 'rsvp'

---

#### CSV Import to Master List

Existing CSV upload logic adapted for master_contacts.

**Accepted columns (case-insensitive header matching):**
- first_name / firstname / first (required)
- last_name / lastname / last (required)
- email (required)
- phone / mobile / cell (optional)
- sms_opt_in / sms_consent (optional; accepts true/false/yes/no/1/0)

**Behavior:**
- Upsert by email — existing records updated, not duplicated
- New records: source = 'csv_import'
- Existing records: update name/phone only if currently blank
- Never overwrite existing opt-in = true with false from CSV
- Show import summary: X added, Y updated, Z skipped (missing email)
- Available from: /admin/contacts (imports to master list only)
  and /admin/events/[id]/contacts (imports to master list AND
  adds to event in one step)

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
| Ticket Confirmation | Email | Stripe `checkout.session.completed`; includes cover image hero when available |
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
| `GOOGLE_SHEETS_API_KEY` | Server only; Google Sheets API v4 read access for master contact sync. Restrict to Sheets API only in Google Cloud Console |

---

## 12. Phase 2 Backlog

- [x] QR code image on ticket (per-event toggle; encodes verification URL)
- [ ] Apple Wallet `.pkpass` ticket generation with QR code
- [x] QR scan check-in at the door via device camera
- [ ] Scheduled invitation sending (future date/time)
- [ ] Automated reminder emails 48hrs before event
- [ ] Waitlist — auto-notify on cancellation
- [ ] Recurring events / clone a past event as template
- [ ] Guest self-service: cancel or transfer ticket
- [ ] Promo codes / discounts
- [ ] Custom subdomain (e.g. `events.yourfarm.com`)
- [ ] Event analytics dashboard (page views, conversion rate)
- [ ] Apple Contacts direct sync via CardDAV
- [ ] Bulk SMS/email send to filtered master contact segment (not tied to a specific event)
- [ ] Contact merge tool for duplicate records
- [ ] Unsubscribe/opt-out landing page for email footer links
- [ ] Import history log showing all past CSV and sheet syncs

---

## 13. Implementation Notes

> For Claude Code / Cursor. Follow these conventions for a clean, production-ready codebase.

- **App Router only.** No Pages Router. All pages are Server Components where possible.
- **Supabase SSR.** Use `@supabase/ssr` for cookie-based auth in App Router.
- **MFA middleware.** After verifying session, check `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` returns `aal2` for all `/admin` routes. Redirect to MFA challenge if not.
- **Server Actions / Route Handlers** for all database mutations.
- **Zod** for all server-side input validation.
- **shadcn/ui** for all UI components (`npx shadcn@latest init`).
- **Dates.** Store all dates in UTC. Display in Mountain Time (`America/Denver`) using the shared `formatDate(date, pattern)` helper in `src/lib/utils.ts`, which wraps `formatInTimeZone` from `date-fns-tz`. All UI and email date formatting must use `formatDate` — never `format` from `date-fns` directly.
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
