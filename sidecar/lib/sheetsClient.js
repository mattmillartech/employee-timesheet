// Stateless Sheets client for the sidecar. Every call takes the caller's own
// OAuth access token — there are no service-account credentials anywhere in
// the sidecar. The sidecar is a thin proxy that adds per-(sheet, tab) mutex
// locking + zod-validated upsert-by-key semantics on top of the raw Sheets
// REST API. It's safe to run anywhere by anyone.

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const CONFIG_TAB = '_Config';
const DAY_ABBREV = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export class SheetsError extends Error {
  constructor(status, message, upstream) {
    super(message);
    this.name = 'SheetsError';
    this.status = status;
    this.upstream = upstream;
  }
}

async function sheetsFetch(url, token, init) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const message = body?.error?.message ?? `Sheets API ${res.status}`;
    throw new SheetsError(res.status, message, body);
  }
  return body;
}

function encodeRange(tab, range) {
  return encodeURIComponent(`${tab}!${range}`);
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function dayAbbrevForISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return DAY_ABBREV[dt.getUTCDay()];
}

function isValidISODate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

async function tabExists(sheetId, tabName, token) {
  const url = `${SHEETS_API_BASE}/${sheetId}?fields=sheets(properties(title))`;
  const data = await sheetsFetch(url, token);
  return (data.sheets ?? []).some((s) => s.properties?.title === tabName);
}

async function getNumericSheetId(sheetId, tabName, token) {
  const url = `${SHEETS_API_BASE}/${sheetId}?fields=sheets(properties(sheetId,title))`;
  const data = await sheetsFetch(url, token);
  const sheet = (data.sheets ?? []).find((s) => s.properties?.title === tabName);
  if (sheet?.properties?.sheetId === undefined) {
    throw new SheetsError(404, `Tab not found: ${tabName}`);
  }
  return sheet.properties.sheetId;
}

// Apostrophe-prefix forces Sheets to store the cell as text. We need this for
// start/end specifically — without it, USER_ENTERED parses "07:00" as a time
// serial and the cell's number format re-renders it on read as "0:00",
// "7:00 AM", etc. (none of which match the canonical HH:MM regex). Date and
// hours columns SHOULD parse, so we don't apostrophe those.
function asSheetText(s) {
  return s ? `'${s}` : '';
}

// Tolerant reverse of asSheetText for legacy rows already mangled by the
// USER_ENTERED round-trip — accepts H:MM, HH:MM, H:MM AM/PM, etc., maps to
// canonical 24-hour HH:MM. Pass-through if unrecognized.
function normalizeStoredTime(s) {
  if (!s) return '';
  if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(s)) return s;
  const m = /^\s*(\d{1,2}):(\d{2})(?:\s*([AaPp])\.?[Mm]?\.?)?\s*$/.exec(s);
  if (!m) return s;
  let h = Number(m[1]);
  const mm = Number(m[2]);
  if (mm > 59) return s;
  const period = m[3]?.toUpperCase();
  if (period === 'A') {
    if (h < 1 || h > 12) return s;
    if (h === 12) h = 0;
  } else if (period === 'P') {
    if (h < 1 || h > 12) return s;
    if (h !== 12) h += 12;
  } else if (h > 23) {
    return s;
  }
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

async function getValues(sheetId, tabName, range, token) {
  const url = `${SHEETS_API_BASE}/${sheetId}/values/${encodeRange(tabName, range)}`;
  const data = await sheetsFetch(url, token);
  return data.values ?? [];
}

export async function listEmployees(sheetId, token) {
  const rows = await getValues(sheetId, CONFIG_TAB, 'A:E', token);
  if (rows.length <= 1) return [];
  return rows
    .slice(1)
    .map((row) => ({
      tabName: row[0] ?? '',
      displayName: row[1] ?? '',
      active: String(row[2] ?? '').toUpperCase() === 'TRUE',
      color: row[3] ?? '',
      sortOrder: Number.parseInt(row[4] ?? '0', 10) || 0,
    }))
    .filter((e) => e.tabName && e.displayName)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function readSlots(sheetId, tabName, token) {
  if (!(await tabExists(sheetId, tabName, token))) {
    throw new SheetsError(404, `Employee tab not found: ${tabName}`);
  }
  const rows = await getValues(sheetId, tabName, 'A:G', token);
  const slots = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    slots.push({
      rowIndex: i + 1,
      date: row[0],
      day: row[1] ?? dayAbbrevForISO(row[0]),
      slotType: row[2] === 'break' ? 'break' : 'work',
      start: normalizeStoredTime(row[3] ?? ''),
      end: normalizeStoredTime(row[4] ?? ''),
      hours: Number.parseFloat(row[5] ?? '0') || 0,
      notes: row[6] ?? '',
    });
  }
  return slots;
}

export async function readSlotsInWeek(sheetId, tabName, weekStartISO, token) {
  if (!isValidISODate(weekStartISO)) {
    throw new SheetsError(400, `weekStart must be YYYY-MM-DD (got: ${weekStartISO})`);
  }
  const slots = await readSlots(sheetId, tabName, token);
  const endISO = addDaysISO(weekStartISO, 6);
  return slots.filter((s) => s.date >= weekStartISO && s.date <= endISO);
}

export async function listWeekStarts(sheetId, tabName, token) {
  const slots = await readSlots(sheetId, tabName, token);
  const sundays = new Set();
  for (const s of slots) {
    const [y, m, d] = s.date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay(); // 0 = Sunday
    dt.setUTCDate(dt.getUTCDate() - dow);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    sundays.add(`${yy}-${mm}-${dd}`);
  }
  return Array.from(sundays).sort((a, b) => b.localeCompare(a));
}

/** Upsert slots by (date, slotType, start). Caller must hold a per-(sheet,tab) mutex. */
export async function upsertSlots(sheetId, tabName, slots, token) {
  if (!(await tabExists(sheetId, tabName, token))) {
    throw new SheetsError(404, `Employee tab not found: ${tabName}`);
  }
  const existing = await readSlots(sheetId, tabName, token);
  const byKey = new Map();
  for (const s of existing) byKey.set(`${s.date}|${s.slotType}|${s.start}`, s);

  const updates = [];
  const appends = [];
  for (const s of slots) {
    const day = s.day || dayAbbrevForISO(s.date);
    const row = [
      s.date,
      day,
      s.slotType,
      asSheetText(s.start),
      asSheetText(s.end),
      s.hours,
      s.notes ?? '',
    ];
    const match = byKey.get(`${s.date}|${s.slotType}|${s.start}`);
    if (match) {
      updates.push({
        range: `${tabName}!A${match.rowIndex}:G${match.rowIndex}`,
        values: [row],
      });
    } else {
      appends.push(row);
    }
  }

  if (updates.length > 0) {
    await sheetsFetch(
      `${SHEETS_API_BASE}/${sheetId}/values:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
      },
    );
  }
  if (appends.length > 0) {
    await sheetsFetch(
      `${SHEETS_API_BASE}/${sheetId}/values/${encodeRange(tabName, 'A:G')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ values: appends }),
      },
    );
  }

  return {
    updated: updates.length,
    appended: appends.length,
    total: updates.length + appends.length,
  };
}

/**
 * Delete slots by natural key `(date, slotType, start)`. Caller must hold a
 * per-(sheet,tab) mutex so concurrent POSTs don't race the rowIndex lookup.
 *
 * Uses `deleteDimension` to physically remove rows (rather than `values:clear`
 * which only blanks cells and leaves an empty row that can confuse reads /
 * the dashboard pivot). Multiple deletions are submitted as a single
 * `batchUpdate` in **descending** rowIndex order — earlier deletions would
 * shift later rowIndexes and target the wrong row.
 *
 * Match semantics use the same normalization the read path applies, so
 * legacy rows with mangled times (e.g. "0:00", "2:15 PM") match an agent
 * request keyed on the canonical "00:00" / "14:15".
 *
 * Returns `{ deleted, missed }` where `missed` lists keys that didn't match
 * any current row (already gone, never existed, or typo).
 */
export async function deleteSlots(sheetId, tabName, keys, token) {
  if (!(await tabExists(sheetId, tabName, token))) {
    throw new SheetsError(404, `Employee tab not found: ${tabName}`);
  }
  const existing = await readSlots(sheetId, tabName, token);
  const byKey = new Map();
  for (const s of existing) {
    byKey.set(`${s.date}|${s.slotType}|${s.start}`, s);
  }

  const matched = [];
  const missed = [];
  for (const k of keys) {
    const m = byKey.get(`${k.date}|${k.slotType}|${k.start}`);
    if (m) matched.push(m);
    else missed.push(k);
  }

  if (matched.length === 0) {
    return { deleted: 0, missed };
  }

  const numericSheetId = await getNumericSheetId(sheetId, tabName, token);
  matched.sort((a, b) => b.rowIndex - a.rowIndex);
  const requests = matched.map((m) => ({
    deleteDimension: {
      range: {
        sheetId: numericSheetId,
        dimension: 'ROWS',
        startIndex: m.rowIndex - 1,
        endIndex: m.rowIndex,
      },
    },
  }));

  await sheetsFetch(`${SHEETS_API_BASE}/${sheetId}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });

  return { deleted: matched.length, missed };
}
