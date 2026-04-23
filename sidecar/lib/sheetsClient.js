import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const CONFIG_TAB = '_Config';
const EMPLOYEE_COLUMNS = ['date', 'day', 'slotType', 'start', 'end', 'hours', 'notes'];
const DAY_ABBREV = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let sheetsClient = null;
let authClient = null;

function initSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const credsRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credsRaw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');
  }
  let credentials;
  try {
    credentials = JSON.parse(credsRaw);
  } catch (err) {
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (did you forget to single-quote it in .env so \\n survives?): ${err.message}`,
    );
  }
  authClient = new GoogleAuth({ credentials, scopes: SCOPES });
  sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return sheetsClient;
}

export function getServiceAccountEmail() {
  const credsRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credsRaw) return null;
  try {
    return JSON.parse(credsRaw).client_email ?? null;
  } catch {
    return null;
  }
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

export async function listEmployees(sheetId) {
  const sheets = initSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CONFIG_TAB}!A:E`,
  });
  const rows = res.data.values ?? [];
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

async function tabExists(sheetId, tabName) {
  const sheets = initSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: 'sheets(properties(title))',
  });
  const titles = (res.data.sheets ?? []).map((s) => s.properties?.title);
  return titles.includes(tabName);
}

export async function readSlots(sheetId, tabName) {
  if (!(await tabExists(sheetId, tabName))) {
    const err = new Error(`Employee tab not found: ${tabName}`);
    err.status = 404;
    throw err;
  }
  const sheets = initSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:G`,
  });
  const rows = res.data.values ?? [];
  const slots = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    slots.push({
      rowIndex: i + 1,
      date: row[0],
      day: row[1] ?? dayAbbrevForISO(row[0]),
      slotType: row[2] === 'break' ? 'break' : 'work',
      start: row[3] ?? '',
      end: row[4] ?? '',
      hours: Number.parseFloat(row[5] ?? '0') || 0,
      notes: row[6] ?? '',
    });
  }
  return slots;
}

export async function readSlotsInWeek(sheetId, tabName, weekStartISO) {
  if (!isValidISODate(weekStartISO)) {
    const err = new Error(`weekStart must be a valid YYYY-MM-DD date (got: ${weekStartISO})`);
    err.status = 400;
    throw err;
  }
  const slots = await readSlots(sheetId, tabName);
  const endISO = addDaysISO(weekStartISO, 6);
  return slots.filter((s) => s.date >= weekStartISO && s.date <= endISO);
}

/** Dedup-on-write. Assumes the caller holds a per-tab mutex. */
export async function upsertSlots(sheetId, tabName, slots) {
  if (!(await tabExists(sheetId, tabName))) {
    const err = new Error(`Employee tab not found: ${tabName}`);
    err.status = 404;
    throw err;
  }
  const sheets = initSheetsClient();
  const existing = await readSlots(sheetId, tabName);
  const byKey = new Map();
  for (const s of existing) {
    byKey.set(`${s.date}|${s.slotType}|${s.start}`, s);
  }

  const updates = [];
  const appends = [];

  for (const s of slots) {
    const day = s.day || dayAbbrevForISO(s.date);
    const row = [s.date, day, s.slotType, s.start, s.end, s.hours, s.notes ?? ''];
    const key = `${s.date}|${s.slotType}|${s.start}`;
    const match = byKey.get(key);
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
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    });
  }
  if (appends.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${tabName}!A:G`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: appends },
    });
  }

  return {
    updated: updates.length,
    appended: appends.length,
    total: updates.length + appends.length,
  };
}

/**
 * List the distinct Sunday-start dates that have at least one slot.
 * Returns ISO dates sorted descending (most recent first).
 */
export async function listWeekStarts(sheetId, tabName) {
  const slots = await readSlots(sheetId, tabName);
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

export { EMPLOYEE_COLUMNS };
