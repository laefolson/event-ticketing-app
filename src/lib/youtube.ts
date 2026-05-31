/**
 * Extract the 11-char YouTube video ID from common URL shapes:
 *  - https://www.youtube.com/watch?v=ID
 *  - https://youtube.com/watch?v=ID&t=…
 *  - https://m.youtube.com/watch?v=ID
 *  - https://youtu.be/ID
 *  - https://youtu.be/ID?t=…
 *  - https://www.youtube.com/embed/ID
 *  - https://www.youtube.com/shorts/ID
 * Returns null for anything that doesn't parse.
 */
export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const s = String(url).trim();
  if (!s) return null;

  // Short link: youtu.be/<id>[?…]
  const short = s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (short) return short[1];

  // /embed/<id> or /shorts/<id>
  const path = s.match(/youtube\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})/);
  if (path) return path[1];

  // /watch?v=<id>
  const watch = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (watch) return watch[1];

  return null;
}

export const YOUTUBE_URL_INVALID_MESSAGE =
  'Enter a valid YouTube URL (youtube.com/watch?v=… or youtu.be/…)';
