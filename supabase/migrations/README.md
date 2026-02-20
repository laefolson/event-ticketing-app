# Supabase Migrations

This directory contains SQL migration files for setting up the database schema.

## Running Migrations

### Using Supabase CLI

1. Install Supabase CLI: `npm install -g supabase`
2. Link your project: `supabase link --project-ref your-project-ref`
3. Run migrations: `supabase db push`

### Manual Execution

You can also run these migrations directly in your Supabase SQL Editor:

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `001_initial_schema.sql`
4. Execute the migration

## Migration Files

- `001_initial_schema.sql` - Initial schema with all tables, enums, indexes, and RLS policies

## Notes

- All tables have Row Level Security (RLS) enabled
- RLS policies enforce role-based access (admin vs helper)
- Public routes can read published events with `link_active = true`
- Team members can manage events, contacts, tickets, etc.
- Only admins can manage team members and settings
