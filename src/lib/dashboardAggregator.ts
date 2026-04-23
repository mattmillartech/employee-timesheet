import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfYear,
  parseISODate,
  rangeBounds,
  saturdayOf,
  startOfMonth,
  startOfWeek,
  startOfYear,
  toISODate,
} from './dateUtils';
import { format } from 'date-fns';
import type {
  DashboardScope,
  Employee,
  RangeKind,
  Slot,
} from '@/types';

export type EmployeeDailyDetail = {
  date: string;
  earliestStart: string | null;
  latestEnd: string | null;
  totalHours: number;
};

/** Week view model: one row per employee, 7 day cells with start/end/total. */
export type WeekView = {
  kind: 'week';
  sunday: string;
  saturday: string;
  daysISO: string[];
  rows: Array<{
    employee: Employee;
    cells: EmployeeDailyDetail[];
    rowTotal: number;
  }>;
  columnTotals: number[]; // 7 values
  grandTotal: number;
};

/** Month view model: one row per employee, weeks-in-month columns with totals only. */
export type MonthView = {
  kind: 'month';
  monthLabel: string; // e.g. "April 2026"
  weekStartsISO: string[]; // Sundays anchoring each displayed week
  rows: Array<{
    employee: Employee;
    cells: number[];
    rowTotal: number;
  }>;
  columnTotals: number[];
  grandTotal: number;
};

/** Year view model: one row per employee, 12 month columns with totals. */
export type YearView = {
  kind: 'year';
  year: number;
  monthLabels: string[]; // length 12 — "Jan", "Feb", ...
  rows: Array<{
    employee: Employee;
    cells: number[];
    rowTotal: number;
  }>;
  columnTotals: number[];
  grandTotal: number;
};

/** All-time view model: one row per employee with grand totals and bounds. */
export type AllTimeView = {
  kind: 'all';
  rows: Array<{
    employee: Employee;
    firstEntry: string | null;
    lastEntry: string | null;
    totalHours: number;
    daysWorked: number;
  }>;
  grandTotal: number;
};

export type DashboardView = WeekView | MonthView | YearView | AllTimeView;

export type AggregatorInput = {
  employees: readonly Employee[];
  slotsByEmployee: ReadonlyMap<string, readonly Slot[]>;
  range: RangeKind;
  anchor: Date;
  scope: DashboardScope;
};

function employeesInScope(
  employees: readonly Employee[],
  scope: DashboardScope,
): readonly Employee[] {
  return scope.kind === 'all'
    ? employees.filter((e) => e.active).slice().sort((a, b) => a.sortOrder - b.sortOrder)
    : employees.filter((e) => e.tabName === scope.tabName);
}

function slotsInRange(
  slots: readonly Slot[],
  startISO: string,
  endISO: string,
): Slot[] {
  return slots.filter((s) => s.date >= startISO && s.date <= endISO);
}

function earliestStartByDay(slots: readonly Slot[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of slots) {
    if (s.slotType !== 'work' || !s.start) continue;
    const cur = map.get(s.date);
    if (cur === undefined || s.start < cur) map.set(s.date, s.start);
  }
  return map;
}

function latestEndByDay(slots: readonly Slot[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of slots) {
    if (s.slotType !== 'work' || !s.end) continue;
    const cur = map.get(s.date);
    if (cur === undefined || s.end > cur) map.set(s.date, s.end);
  }
  return map;
}

function totalHoursByDay(slots: readonly Slot[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of slots) {
    map.set(s.date, (map.get(s.date) ?? 0) + s.hours);
  }
  return map;
}

function aggregateWeek(input: AggregatorInput): WeekView {
  const sunday = startOfWeek(input.anchor, { weekStartsOn: 0 });
  const saturday = saturdayOf(sunday);
  const daysISO = eachDayOfInterval({ start: sunday, end: saturday }).map(toISODate);
  const startISO = daysISO[0] ?? toISODate(sunday);
  const endISO = daysISO[daysISO.length - 1] ?? toISODate(saturday);
  const scoped = employeesInScope(input.employees, input.scope);

  const rows = scoped.map((employee) => {
    const slots = slotsInRange(input.slotsByEmployee.get(employee.tabName) ?? [], startISO, endISO);
    const starts = earliestStartByDay(slots);
    const ends = latestEndByDay(slots);
    const totals = totalHoursByDay(slots);
    const cells: EmployeeDailyDetail[] = daysISO.map((date) => ({
      date,
      earliestStart: starts.get(date) ?? null,
      latestEnd: ends.get(date) ?? null,
      totalHours: totals.get(date) ?? 0,
    }));
    const rowTotal = cells.reduce((sum, c) => sum + c.totalHours, 0);
    return { employee, cells, rowTotal };
  });

  const columnTotals = daysISO.map((_, i) =>
    rows.reduce((sum, r) => sum + (r.cells[i]?.totalHours ?? 0), 0),
  );
  const grandTotal = columnTotals.reduce((s, v) => s + v, 0);

  return {
    kind: 'week',
    sunday: startISO,
    saturday: endISO,
    daysISO,
    rows,
    columnTotals,
    grandTotal,
  };
}

function aggregateMonth(input: AggregatorInput): MonthView {
  const monthStart = startOfMonth(input.anchor);
  const monthEnd = endOfMonth(input.anchor);
  // Weeks whose Sunday is <= monthEnd and whose Saturday >= monthStart.
  const weekStartsISO: string[] = [];
  for (
    let cursor = startOfWeek(monthStart, { weekStartsOn: 0 });
    cursor <= monthEnd;
    cursor = addDays(cursor, 7)
  ) {
    weekStartsISO.push(toISODate(cursor));
  }

  const scoped = employeesInScope(input.employees, input.scope);

  const rows = scoped.map((employee) => {
    const slots = input.slotsByEmployee.get(employee.tabName) ?? [];
    const cells = weekStartsISO.map((ws) => {
      const weekEnd = toISODate(addDays(parseISODate(ws) ?? monthStart, 6));
      const slotsInWeek = slots.filter((s) => s.date >= ws && s.date <= weekEnd);
      // Clip to the actual month (not spill-over days)
      const inMonth = slotsInWeek.filter((s) => {
        const d = parseISODate(s.date);
        return d !== null && d >= monthStart && d <= monthEnd;
      });
      return inMonth.reduce((sum, s) => sum + s.hours, 0);
    });
    const rowTotal = cells.reduce((sum, v) => sum + v, 0);
    return { employee, cells, rowTotal };
  });

  const columnTotals = weekStartsISO.map((_, i) =>
    rows.reduce((sum, r) => sum + (r.cells[i] ?? 0), 0),
  );
  const grandTotal = columnTotals.reduce((s, v) => s + v, 0);

  return {
    kind: 'month',
    monthLabel: format(monthStart, 'MMMM yyyy'),
    weekStartsISO,
    rows,
    columnTotals,
    grandTotal,
  };
}

function aggregateYear(input: AggregatorInput): YearView {
  const yearStart = startOfYear(input.anchor);
  const yearEnd = endOfYear(input.anchor);
  const scoped = employeesInScope(input.employees, input.scope);
  const monthLabels = Array.from({ length: 12 }, (_, i) =>
    format(new Date(yearStart.getFullYear(), i, 1), 'MMM'),
  );

  const rows = scoped.map((employee) => {
    const slots = (input.slotsByEmployee.get(employee.tabName) ?? []).filter((s) => {
      const d = parseISODate(s.date);
      return d !== null && d >= yearStart && d <= yearEnd;
    });
    const cells: number[] = Array.from({ length: 12 }, () => 0);
    for (const s of slots) {
      const d = parseISODate(s.date);
      if (!d) continue;
      const idx = d.getMonth();
      const current = cells[idx] ?? 0;
      cells[idx] = current + s.hours;
    }
    const rowTotal = cells.reduce((sum, v) => sum + v, 0);
    return { employee, cells, rowTotal };
  });

  const columnTotals = Array.from({ length: 12 }, (_, i) =>
    rows.reduce((sum, r) => sum + (r.cells[i] ?? 0), 0),
  );
  const grandTotal = columnTotals.reduce((s, v) => s + v, 0);

  return {
    kind: 'year',
    year: yearStart.getFullYear(),
    monthLabels,
    rows,
    columnTotals,
    grandTotal,
  };
}

function aggregateAll(input: AggregatorInput): AllTimeView {
  const scoped = employeesInScope(input.employees, input.scope);

  const rows = scoped.map((employee) => {
    const slots = input.slotsByEmployee.get(employee.tabName) ?? [];
    const dates = new Set<string>();
    let first: string | null = null;
    let last: string | null = null;
    let total = 0;
    for (const s of slots) {
      dates.add(s.date);
      if (first === null || s.date < first) first = s.date;
      if (last === null || s.date > last) last = s.date;
      total += s.hours;
    }
    return {
      employee,
      firstEntry: first,
      lastEntry: last,
      totalHours: total,
      daysWorked: dates.size,
    };
  });

  const grandTotal = rows.reduce((s, r) => s + r.totalHours, 0);
  return { kind: 'all', rows, grandTotal };
}

export function aggregate(input: AggregatorInput): DashboardView {
  // Touch rangeBounds so callers can rely on it for their own windowing.
  void rangeBounds;
  switch (input.range) {
    case 'week':
      return aggregateWeek(input);
    case 'month':
      return aggregateMonth(input);
    case 'year':
      return aggregateYear(input);
    case 'all':
      return aggregateAll(input);
    default: {
      const _exhaustive: never = input.range;
      throw new Error(`Unknown range: ${String(_exhaustive)}`);
    }
  }
}
