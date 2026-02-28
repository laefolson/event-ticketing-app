# CLAUDE.md — Event Ticketing App

## Overview

Private event ticketing system for a barn venue. Admins create events, manage guest lists, sell tickets via Stripe, and send invitations. Guests RSVP and purchase tickets through public event pages.

See `SPEC.md` for the full feature specification and `.cursorrules.md` for Cursor IDE conventions.

## Tech Stack

- **Framework**: Next.js 16.1.6 (App Router, no Pages Router)
- **Language**: TypeScript (strict mode)
- **Database & Auth**: Supabase (Postgres + Auth + Storage)
- **Payments**: Stripe Checkout (hosted)
- **Email**: Resend (React Email templates)
- **SMS**: Twilio (Messaging Service)
- **Styling**: Tailwind CSS v4, shadcn/ui (stone theme, new-york style), lucide-react icons
- **Dates**: date-fns + date-fns-tz

## Project Structure

```
src/
├── app/
│   ├── admin/              # Protected routes (requires auth + MFA aal2)
│   │   ├── layout.tsx      # Nav bar with links + sign out
│   │   ├── page.tsx        # Dashboard — stats cards + upcoming events
│   │   ├── events/         # Event CRUD
│   │   │   ├── page.tsx
│   │   │   ├── new/
│   │   │   └── [id]/       # Edit, tiers, contacts, attendees, post-event
│   │   ├── archive/        # Archived events + detail
│   │   ├── team/           # Team management (admin only)
│   │   └── settings/       # App settings (admin only)
│   ├── auth/
│   │   ├── login/          # Email/password login (Client Component)
│   │   ├── mfa/            # TOTP enrollment & challenge (Client Component)
│   │   ├── callback/       # OAuth callback (API route)
│   │   └── actions.ts      # logout() server action
│   ├── e/[slug]/           # Public event pages (no auth required)
│   │   ├── page.tsx        # Event landing page
│   │   ├── rsvp/           # RSVP form
│   │   ├── checkout/       # Stripe Checkout
│   │   └── confirm/        # Order confirmation
│   └── api/webhooks/
│       ├── stripe/           # Stripe payment webhook
│       ├── resend/           # Resend email delivery status webhook
│       └── twilio/           # Twilio SMS delivery status webhook
├── components/ui/          # shadcn/ui: badge, button, card, input, input-otp, label
├── lib/
│   ├── supabase/server.ts  # createClient() — async, uses cookies()
│   ├── supabase/client.ts  # createClient() — browser, no cookies
│   └── utils.ts            # cn() helper (clsx + tailwind-merge)
├── types/
│   ├── database.ts         # Table interfaces + enum types
│   └── actions.ts          # ActionResponse<T> type
└── middleware.ts            # Session refresh + MFA enforcement
```

## Authentication

1. **Login** → email/password via Supabase Auth
2. **MFA** → TOTP (authenticator app). First login enrolls, subsequent logins challenge.
3. **Middleware** enforces on all `/admin/*` routes:
   - No session → redirect to `/auth/login?redirectTo=...`
   - Session but no aal2 → redirect to `/auth/mfa?redirectTo=...`
4. Sessions stored in HTTP-only cookies, refreshed on every request by middleware.

## Database

Schema in `supabase/migrations/001_initial_schema.sql`. RLS enabled on all tables.

**Tables**: events, ticket_tiers, contacts, tickets, team_members, csv_imports, invitation_logs

**Key enums**: `event_status` (draft/published/archived), `ticket_status` (pending/confirmed/checked_in/cancelled/refunded), `team_role` (admin/helper)

## Conventions

### Server Components by default
All pages are async Server Components unless they need interactivity (`'use client'`). Client components are used for forms with hooks (useState, useActionState, useSearchParams).

### Supabase queries in Server Components
```typescript
const supabase = await createClient(); // from @/lib/supabase/server
const { data, error } = await supabase.from('table').select('...');
```

### Server Actions return ActionResponse
```typescript
'use server';
export async function myAction(data: T): Promise<ActionResponse<R>> {
  // ... never throw, always return { success, data?, error? }
}
```

### Imports use `@/` alias
All imports use `@/components`, `@/lib`, `@/types` — never relative paths across directories.

### Adding shadcn/ui components
```bash
npx shadcn@latest add [component-name]
```

### Money stored as cents
All monetary values are integers in cents (e.g., `price_cents`, `amount_paid_cents`). Format for display with `Intl.NumberFormat`.

### Dates stored as UTC
All timestamps are `TIMESTAMPTZ` in Postgres. Format for display with `date-fns` / `date-fns-tz`.

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # ESLint
npx tsc --noEmit  # Type check
```

## Environment Variables

See `.env.local`. Public vars prefixed with `NEXT_PUBLIC_`. Server-only keys: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`.

## Current Status

**Completed**: Project setup, auth (login + TOTP MFA + middleware), admin layout + dashboard with live stats.

**Most admin routes are placeholders** — events CRUD, tiers, contacts, attendees, post-event, archive, team, and settings pages have TODO comments but no implementation yet. Public event pages (`/e/[slug]/*`) are also placeholders.
