import type { SlotType } from '@/types';

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHHMM(s: string): boolean {
  return HHMM_RE.test(s);
}

export function parseHHMMToMinutes(s: string): number | null {
  const m = HHMM_RE.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h * 60 + mm;
}

export function minutesToHHMM(min: number): string {
  const clamped = ((Math.round(min) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Format a 24h "HH:MM" string for display.
 * `12h` returns "7:00 AM" / "3:30 PM"; `24h` returns the value as-is.
 */
export function formatForDisplay(hhmm: string, mode: '12h' | '24h'): string {
  if (mode === '24h') return hhmm;
  const m = HHMM_RE.exec(hhmm);
  if (!m) return hhmm;
  const h24 = Number(m[1]);
  const mm = m[2];
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${period}`;
}

/**
 * Calculate signed decimal hours between start and end.
 * - end < start (e.g. overnight) → treated as crossing midnight, returns positive.
 * - `isBreak` → result is negated.
 */
export function calculateHours(start: string, end: string, slotType: SlotType): number {
  const s = parseHHMMToMinutes(start);
  const e = parseHHMMToMinutes(end);
  if (s === null || e === null) return 0;
  let diff = e - s;
  if (diff < 0) diff += 24 * 60;
  const hours = diff / 60;
  return slotType === 'break' ? -hours : hours;
}

/**
 * User typed up to 4 digits — format as HH:MM as they type.
 *   "0"     → "0"
 *   "07"    → "07"
 *   "070"   → "07:0"
 *   "0700"  → "07:00"
 *   "7"     → "7"     (don't pad until 4 digits present)
 */
export function autoFormat4Digit(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** Normalize user input to a valid HH:MM string if possible; returns null if not. */
export function normalizeTimeInput(raw: string): string | null {
  const autoFormatted = autoFormat4Digit(raw);
  if (isValidHHMM(autoFormatted)) return autoFormatted;
  // Also accept already-formatted HH:MM
  if (isValidHHMM(raw)) return raw;
  return null;
}

/**
 * Tolerant parser for time strings *read back* from the sheet.
 *
 * Sheets API `valueInputOption=USER_ENTERED` parses any string that looks
 * like a time (e.g. "07:00") into a serial-number time value, which then
 * round-trips back via the cell's number format as "0:00", "9:30",
 * "7:00 AM", "2:15 PM", etc. — none of which pass `isValidHHMM`. Writes now
 * force text storage (apostrophe-prefixed in `slotToRow*`), but legacy rows
 * already in the sheet still need to load cleanly.
 *
 * Returns canonical zero-padded "HH:MM" if recognizable, else the original
 * string so the user can still see + correct it.
 */
export function normalizeStoredTime(s: string): string {
  if (!s) return '';
  if (isValidHHMM(s)) return s;
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

export function formatHours(h: number): string {
  const rounded = Math.round(h * 100) / 100;
  return rounded.toFixed(2);
}

/** One decimal, sign-preserving, for display in dashboard cells. */
export function formatHoursShort(h: number): string {
  const rounded = Math.round(h * 10) / 10;
  return rounded.toFixed(1);
}
