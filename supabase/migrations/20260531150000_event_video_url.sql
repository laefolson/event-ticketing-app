-- Optional YouTube video URL per event. Rendered as a responsive 16:9
-- embed on the public event page; stored as the raw URL so admins can
-- paste either youtube.com/watch?v=... or youtu.be/... form.
ALTER TABLE events ADD COLUMN IF NOT EXISTS video_url TEXT;
