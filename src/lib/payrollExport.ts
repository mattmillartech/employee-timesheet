import type { DashboardView } from './dashboardAggregator';
import { formatHoursShort } from './timeUtils';
import { format, parseISODate } from './dateUtils';

/**
 * Renders a DashboardView to a tab-separated string suitable for clipboard
 * paste into Google Sheets or Excel.
 */
export function dashboardToTSV(view: DashboardView): string {
  switch (view.kind) {
    case 'week':
      return weekToTSV(view);
    case 'month':
      return monthToTSV(view);
    case 'year':
      return yearToTSV(view);
    case 'all':
      return allTimeToTSV(view);
    default: {
      const _exhaustive: never = view;
      throw new Error(`Unknown view kind: ${String(_exhaustive)}`);
    }
  }
}

function dayHeader(iso: string): string {
  const d = parseISODate(iso);
  return d ? format(d, 'EEE d') : iso;
}

function weekToTSV(view: import('./dashboardAggregator').WeekView): string {
  const header = ['Employee', ...view.daysISO.map(dayHeader), 'TOTAL'];
  const lines: string[] = [header.join('\t')];
  for (const row of view.rows) {
    const cells = row.cells.map((c) =>
      c.totalHours === 0
        ? '—'
        : `${c.earliestStart ?? ''}→${c.latestEnd ?? ''} ${formatHoursShort(c.totalHours)}h`,
    );
    lines.push([row.employee.displayName, ...cells, formatHoursShort(row.rowTotal)].join('\t'));
  }
  lines.push(
    ['TOTAL', ...view.columnTotals.map((t) => (t === 0 ? '—' : formatHoursShort(t))), formatHoursShort(view.grandTotal)].join('\t'),
  );
  return lines.join('\n');
}

function monthToTSV(view: import('./dashboardAggregator').MonthView): string {
  const header = [
    'Employee',
    ...view.weekStartsISO.map((iso) => `Week of ${dayHeader(iso)}`),
    'TOTAL',
  ];
  const lines: string[] = [header.join('\t')];
  for (const row of view.rows) {
    lines.push(
      [
        row.employee.displayName,
        ...row.cells.map((v) => (v === 0 ? '—' : formatHoursShort(v))),
        formatHoursShort(row.rowTotal),
      ].join('\t'),
    );
  }
  lines.push(
    [
      'TOTAL',
      ...view.columnTotals.map((t) => (t === 0 ? '—' : formatHoursShort(t))),
      formatHoursShort(view.grandTotal),
    ].join('\t'),
  );
  return lines.join('\n');
}

function yearToTSV(view: import('./dashboardAggregator').YearView): string {
  const header = ['Employee', ...view.monthLabels, 'TOTAL'];
  const lines: string[] = [header.join('\t')];
  for (const row of view.rows) {
    lines.push(
      [
        row.employee.displayName,
        ...row.cells.map((v) => (v === 0 ? '—' : formatHoursShort(v))),
        formatHoursShort(row.rowTotal),
      ].join('\t'),
    );
  }
  lines.push(
    [
      'TOTAL',
      ...view.columnTotals.map((t) => (t === 0 ? '—' : formatHoursShort(t))),
      formatHoursShort(view.grandTotal),
    ].join('\t'),
  );
  return lines.join('\n');
}

function allTimeToTSV(view: import('./dashboardAggregator').AllTimeView): string {
  const header = ['Employee', 'First Entry', 'Last Entry', 'Days Worked', 'TOTAL Hours'];
  const lines: string[] = [header.join('\t')];
  for (const row of view.rows) {
    lines.push(
      [
        row.employee.displayName,
        row.firstEntry ?? '—',
        row.lastEntry ?? '—',
        String(row.daysWorked),
        formatHoursShort(row.totalHours),
      ].join('\t'),
    );
  }
  lines.push(['GRAND TOTAL', '', '', '', formatHoursShort(view.grandTotal)].join('\t'));
  return lines.join('\n');
}

export async function copyTSVToClipboard(tsv: string): Promise<void> {
  if (!('clipboard' in navigator)) throw new Error('Clipboard API unavailable');
  await navigator.clipboard.writeText(tsv);
}
