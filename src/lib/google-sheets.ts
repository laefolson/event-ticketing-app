// Lightweight Google Sheets API v4 access for the master-contacts sync.
// Public sheets only (anyone-with-link can view) — uses an API key, no OAuth.
// Set GOOGLE_SHEETS_API_KEY in env. Restrict the key to the Sheets API only
// in Google Cloud Console.

const SHEET_ID_RE = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;

export function extractSheetId(url: string): string | null {
  const m = url.match(SHEET_ID_RE);
  return m ? m[1] : null;
}

function apiKey(): string {
  const key = process.env.GOOGLE_SHEETS_API_KEY;
  if (!key) {
    throw new Error(
      'GOOGLE_SHEETS_API_KEY is not configured. Add it to .env.local and restart the dev server.'
    );
  }
  return key;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    let body = '';
    try {
      body = (await res.text()).slice(0, 300);
    } catch {
      // ignore
    }
    if (res.status === 403) {
      throw new Error(
        'Google Sheets returned 403 — either the API key is wrong/restricted, or the sheet is not shared as "Anyone with the link can view."'
      );
    }
    if (res.status === 404) {
      throw new Error('Google Sheet not found — check the URL.');
    }
    throw new Error(`Google Sheets API error ${res.status}: ${body}`);
  }
  return res.json();
}

interface SheetsMetadata {
  sheets: { properties: { title: string } }[];
}

interface SheetsValues {
  values?: string[][];
}

export async function fetchFirstSheetName(sheetId: string): Promise<string> {
  const data = (await getJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title&key=${apiKey()}`
  )) as SheetsMetadata;
  const first = data.sheets?.[0]?.properties?.title;
  if (!first) throw new Error('Google Sheet has no readable tabs.');
  return first;
}

export async function fetchSheetValues(sheetId: string, sheetName: string): Promise<string[][]> {
  const range = `${sheetName}!A1:Z`;
  const data = (await getJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey()}`
  )) as SheetsValues;
  return data.values ?? [];
}

export interface SheetFetchResult {
  sheetName: string;
  headers: string[];
  dataRows: string[][];
}

/**
 * Fetch the first sheet's headers + data rows for a public Google Sheet URL.
 * Throws with a user-friendly message on common failures.
 */
export async function fetchPublicSheet(url: string): Promise<SheetFetchResult> {
  const sheetId = extractSheetId(url);
  if (!sheetId) {
    throw new Error('Could not extract a sheet ID from that URL. Use the full https://docs.google.com/spreadsheets/d/... link.');
  }
  const sheetName = await fetchFirstSheetName(sheetId);
  const values = await fetchSheetValues(sheetId, sheetName);
  if (values.length === 0) {
    return { sheetName, headers: [], dataRows: [] };
  }
  const [headerRow, ...dataRows] = values;
  // Trim every header. Pad short rows so column indices line up.
  const headers = headerRow.map((h) => (h ?? '').toString().trim()).filter((h) => h.length > 0);
  const headerCount = headerRow.length;
  const padded = dataRows.map((row) => {
    const r = row.slice();
    while (r.length < headerCount) r.push('');
    return r;
  });
  return { sheetName, headers, dataRows: padded };
}
