-- Add Save the Date fields to events
ALTER TABLE events ADD COLUMN save_the_date_image_url TEXT;
ALTER TABLE events ADD COLUMN save_the_date_text TEXT;

-- Add 'save_the_date' to message_type enum
ALTER TYPE message_type ADD VALUE 'save_the_date';
