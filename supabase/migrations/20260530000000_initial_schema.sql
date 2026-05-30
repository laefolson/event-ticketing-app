


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."event_status" AS ENUM (
    'draft',
    'published',
    'archived'
);


ALTER TYPE "public"."event_status" OWNER TO "postgres";


CREATE TYPE "public"."event_type" AS ENUM (
    'dinner',
    'concert',
    'movie_night',
    'other'
);


ALTER TYPE "public"."event_type" OWNER TO "postgres";


CREATE TYPE "public"."invitation_channel" AS ENUM (
    'email',
    'sms',
    'both',
    'none'
);


ALTER TYPE "public"."invitation_channel" OWNER TO "postgres";


CREATE TYPE "public"."message_channel" AS ENUM (
    'email',
    'sms'
);


ALTER TYPE "public"."message_channel" OWNER TO "postgres";


CREATE TYPE "public"."message_status" AS ENUM (
    'sent',
    'delivered',
    'failed',
    'bounced'
);


ALTER TYPE "public"."message_status" OWNER TO "postgres";


CREATE TYPE "public"."message_type" AS ENUM (
    'invitation',
    'thank_you',
    'save_the_date',
    'ticket_resend'
);


ALTER TYPE "public"."message_type" OWNER TO "postgres";


CREATE TYPE "public"."team_role" AS ENUM (
    'admin',
    'helper'
);


ALTER TYPE "public"."team_role" OWNER TO "postgres";


CREATE TYPE "public"."ticket_status" AS ENUM (
    'pending',
    'confirmed',
    'checked_in',
    'cancelled',
    'refunded'
);


ALTER TYPE "public"."ticket_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_quantity_sold"("p_tier_id" "uuid", "p_delta" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
  DECLARE
    new_val integer;
  BEGIN
    UPDATE ticket_tiers
    SET quantity_sold = greatest(0, least(quantity_total, quantity_sold + p_delta))
    WHERE id = p_tier_id
    RETURNING quantity_sold INTO new_val;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tier % not found', p_tier_id;
    END IF;

    RETURN new_val;
  END;
  $$;


ALTER FUNCTION "public"."adjust_quantity_sold"("p_tier_id" "uuid", "p_delta" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_ticket_code"() RETURNS "text"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."generate_ticket_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.team_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    );
  $$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_member"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.team_members WHERE user_id = (SELECT auth.uid())
    );
  $$;


ALTER FUNCTION "public"."is_team_member"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '""'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "invitation_channel" "public"."invitation_channel" DEFAULT 'none'::"public"."invitation_channel",
    "invited_at" timestamp with time zone,
    "csv_source" "text",
    "imported_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."csv_imports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "row_count" integer DEFAULT 0,
    "imported_count" integer DEFAULT 0,
    "skipped_count" integer DEFAULT 0,
    "imported_by" "uuid",
    "imported_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."csv_imports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "event_type" "public"."event_type" NOT NULL,
    "description" "text",
    "date_start" timestamp with time zone NOT NULL,
    "date_end" timestamp with time zone NOT NULL,
    "location_name" "text",
    "location_address" "text",
    "capacity" integer,
    "is_published" boolean DEFAULT false,
    "cover_image_url" "text",
    "gallery_urls" "text"[] DEFAULT '{}'::"text"[],
    "host_bio" "text",
    "faq" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "public"."event_status" DEFAULT 'draft'::"public"."event_status",
    "link_active" boolean DEFAULT true,
    "archived_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "social_sharing_enabled" boolean DEFAULT false NOT NULL,
    "host_bio_headline" "text",
    "save_the_date_image_url" "text",
    "save_the_date_text" "text",
    "ticket_qr_enabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitation_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "message_type" "public"."message_type" NOT NULL,
    "channel" "public"."message_channel" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "status" "public"."message_status" DEFAULT 'sent'::"public"."message_status",
    "provider_message_id" "text",
    "error_code" "text"
);


ALTER TABLE "public"."invitation_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sms_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "consent_type" "text" NOT NULL,
    "consent_text" "text" NOT NULL,
    "ip_address" "text" NOT NULL,
    "event_id" "uuid",
    "consented_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sms_consents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."team_role" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "mfa_enabled" boolean DEFAULT false,
    "invited_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_tiers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price_cents" integer DEFAULT 0,
    "quantity_total" integer NOT NULL,
    "quantity_sold" integer DEFAULT 0,
    "max_per_contact" integer,
    "stripe_price_id" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ticket_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "tier_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "attendee_name" "text" NOT NULL,
    "attendee_email" "text",
    "attendee_phone" "text",
    "ticket_code" "text" DEFAULT ("extensions"."uuid_generate_v4"())::"text" NOT NULL,
    "quantity" integer DEFAULT 1,
    "stripe_payment_intent_id" "text",
    "stripe_session_id" "text",
    "amount_paid_cents" integer DEFAULT 0,
    "status" "public"."ticket_status" DEFAULT 'pending'::"public"."ticket_status",
    "checked_in_at" timestamp with time zone,
    "purchased_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."csv_imports"
    ADD CONSTRAINT "csv_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."invitation_logs"
    ADD CONSTRAINT "invitation_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sms_consents"
    ADD CONSTRAINT "sms_consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."ticket_tiers"
    ADD CONSTRAINT "ticket_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_ticket_code_key" UNIQUE ("ticket_code");



CREATE INDEX "idx_contacts_email" ON "public"."contacts" USING "btree" ("event_id", "lower"("email"));



CREATE INDEX "idx_contacts_event_id" ON "public"."contacts" USING "btree" ("event_id");



CREATE INDEX "idx_csv_imports_event_id" ON "public"."csv_imports" USING "btree" ("event_id");



CREATE INDEX "idx_events_created_by" ON "public"."events" USING "btree" ("created_by");



CREATE INDEX "idx_events_slug" ON "public"."events" USING "btree" ("slug");



CREATE INDEX "idx_events_status" ON "public"."events" USING "btree" ("status");



CREATE INDEX "idx_invitation_logs_contact_id" ON "public"."invitation_logs" USING "btree" ("contact_id");



CREATE INDEX "idx_invitation_logs_event_id" ON "public"."invitation_logs" USING "btree" ("event_id");



CREATE INDEX "idx_team_members_email" ON "public"."team_members" USING "btree" ("email");



CREATE INDEX "idx_team_members_user_id" ON "public"."team_members" USING "btree" ("user_id");



CREATE INDEX "idx_ticket_tiers_event_id" ON "public"."ticket_tiers" USING "btree" ("event_id");



CREATE INDEX "idx_tickets_attendee_email" ON "public"."tickets" USING "btree" ("event_id", "tier_id", "attendee_email");



CREATE INDEX "idx_tickets_attendee_phone" ON "public"."tickets" USING "btree" ("event_id", "tier_id", "attendee_phone");



CREATE INDEX "idx_tickets_contact_id" ON "public"."tickets" USING "btree" ("contact_id");



CREATE INDEX "idx_tickets_event_id" ON "public"."tickets" USING "btree" ("event_id");



CREATE INDEX "idx_tickets_status" ON "public"."tickets" USING "btree" ("status");



CREATE INDEX "idx_tickets_ticket_code" ON "public"."tickets" USING "btree" ("ticket_code");



CREATE INDEX "idx_tickets_tier_id" ON "public"."tickets" USING "btree" ("tier_id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."csv_imports"
    ADD CONSTRAINT "csv_imports_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."csv_imports"
    ADD CONSTRAINT "csv_imports_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitation_logs"
    ADD CONSTRAINT "invitation_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitation_logs"
    ADD CONSTRAINT "invitation_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sms_consents"
    ADD CONSTRAINT "sms_consents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_tiers"
    ADD CONSTRAINT "ticket_tiers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."ticket_tiers"("id") ON DELETE RESTRICT;



CREATE POLICY "Admins can delete events" ON "public"."events" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."team_role")))));



CREATE POLICY "Admins can delete team members" ON "public"."team_members" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can insert team members" ON "public"."team_members" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can modify settings" ON "public"."app_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."team_role")))));



CREATE POLICY "Admins can update team members" ON "public"."team_members" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Public can view active published events" ON "public"."events" FOR SELECT USING ((("is_published" = true) AND ("link_active" = true)));



CREATE POLICY "Public can view tiers for active events" ON "public"."ticket_tiers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."events"
  WHERE (("events"."id" = "ticket_tiers"."event_id") AND ("events"."is_published" = true) AND ("events"."link_active" = true)))));



CREATE POLICY "Team members can create events" ON "public"."events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can create invitation logs" ON "public"."invitation_logs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can manage contacts" ON "public"."contacts" USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can manage imports" ON "public"."csv_imports" USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can manage tickets" ON "public"."tickets" USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can manage tiers" ON "public"."ticket_tiers" USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can read settings" ON "public"."app_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can update events" ON "public"."events" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can view all events" ON "public"."events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Team members can view all team members" ON "public"."team_members" FOR SELECT USING ("public"."is_team_member"());



CREATE POLICY "Team members can view invitation logs" ON "public"."invitation_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."csv_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitation_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sms_consents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."adjust_quantity_sold"("p_tier_id" "uuid", "p_delta" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_quantity_sold"("p_tier_id" "uuid", "p_delta" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_quantity_sold"("p_tier_id" "uuid", "p_delta" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_ticket_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_ticket_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_ticket_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_member"() TO "service_role";


















GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."csv_imports" TO "anon";
GRANT ALL ON TABLE "public"."csv_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."csv_imports" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."invitation_logs" TO "anon";
GRANT ALL ON TABLE "public"."invitation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."invitation_logs" TO "service_role";



GRANT ALL ON TABLE "public"."sms_consents" TO "anon";
GRANT ALL ON TABLE "public"."sms_consents" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_consents" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_tiers" TO "anon";
GRANT ALL ON TABLE "public"."ticket_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































