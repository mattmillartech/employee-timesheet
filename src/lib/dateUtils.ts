import {
  addDays,
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns';
import { DAY_ABBREVIATIONS } from './constants';
import type { RangeKind } from '@/types';

const WEEK_STARTS_ON = 0 as const; // Sunday

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/**
 * Returns "today" as a YYYY-MM-DD string in the given IANA timezone.
 * Uses Intl.DateTimeFormat so it's correct at DST boundaries.
 */
export function todayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Returns a Date representing "now" as it appears in the given IANA timezone.
 * Useful to pass into date-fns week helpers so week boundaries respect the user's TZ.
 */
export function nowInTimezone(timezone: string): Date {
  const iso = todayInTimezone(timezone);
  const parts = iso.split('-').map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
}

export function parseISODate(iso: string): Date | null {
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

export function dayAbbrev(d: Date): string {
  const idx = d.getDay(); // 0 = Sunday
  return DAY_ABBREVIATIONS[idx] ?? '';
}

export function sundayOf(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: WEEK_STARTS_ON });
}

export function saturdayOf(d: Date): Date {
  return endOfWeek(d, { weekStartsOn: WEEK_STARTS_ON });
}

export function weekDays(sunday: Date): Date[] {
  return eachDayOfInterval({ start: sunday, end: addDays(sunday, 6) });
}

export function formatWeekRange(sunday: Date): string {
  const sat = addDays(sunday, 6);
  const startLabel = format(sunday, 'MMM d');
  const endLabel =
    sunday.getMonth() === sat.getMonth() ? format(sat, 'd, yyyy') : format(sat, 'MMM d, yyyy');
  return `${startLabel} – ${endLabel}`;
}

export function rangeBounds(
  kind: RangeKind,
  anchor: Date,
): { start: Date; end: Date } {
  switch (kind) {
    case 'week': {
      const start = sundayOf(anchor);
      return { start, end: saturdayOf(start) };
    }
    case 'month':
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case 'year':
      return { start: startOfYear(anchor), end: endOfYear(anchor) };
    case 'all':
      // "All time" — caller picks actual data bounds; return a very wide window.
      return {
        start: parseISO('2000-01-01'),
        end: endOfYear(addYears(anchor, 10)),
      };
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown range kind: ${String(_exhaustive)}`);
    }
  }
}

export function shiftRange(kind: RangeKind, anchor: Date, direction: -1 | 1): Date {
  switch (kind) {
    case 'week':
      return direction === 1 ? addDays(anchor, 7) : subDays(anchor, 7);
    case 'month':
      return addMonths(anchor, direction);
    case 'year':
      return addYears(anchor, direction);
    case 'all':
      return anchor;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown range kind: ${String(_exhaustive)}`);
    }
  }
}

export {
  addDays,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
};
