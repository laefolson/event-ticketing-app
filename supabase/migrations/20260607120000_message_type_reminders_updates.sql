-- Two new message_type values feeding new admin send flows:
--   * 'ticket_reminder'  — gentle nudge to contacts who were invited
--                          but haven't purchased a ticket yet, sent
--                          from the event Contacts tab.
--   * 'event_update'     — broadcasts to confirmed/checked-in ticket
--                          holders for weather alerts, parking notes,
--                          last-minute logistics, etc., sent from the
--                          Attendees tab.
--
-- Both flows write to invitation_logs the same way as invitations and
-- save-the-dates so Resend/Twilio webhooks can mark them
-- delivered/bounced/failed.

ALTER TYPE "public"."message_type" ADD VALUE IF NOT EXISTS 'ticket_reminder';
ALTER TYPE "public"."message_type" ADD VALUE IF NOT EXISTS 'event_update';
