-- Add 'ticket_confirmation' to the message_type enum so the initial
-- ticket-confirmation email sent from the Stripe webhook can be logged
-- to invitation_logs distinctly from 'ticket_resend'. This lets bounce
-- events from Resend flow back into a row the attendees view can join
-- against to surface a "ticket email bounced" warning.

ALTER TYPE "public"."message_type" ADD VALUE IF NOT EXISTS 'ticket_confirmation';
