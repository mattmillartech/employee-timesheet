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

export function formatHours(h: number): string {
  const rounded = Math.round(h * 100) / 100;
  return rounded.toFixed(2);
}

/** One decimal, sign-preserving, for display in dashboard cells. */
export function formatHoursShort(h: number): string {
  const rounded = Math.round(h * 10) / 10;
  return rounded.toFixed(1);
}
