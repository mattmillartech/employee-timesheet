import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { format } from '@/lib/dateUtils';
import { startOfMonth, startOfYear } from 'date-fns';
import type { DashboardScope, Employee, RangeKind } from '@/types';

export type DashboardFiltersProps = {
  employees: readonly Employee[];
  scope: DashboardScope;
  onScopeChange: (next: DashboardScope) => void;
  range: RangeKind;
  onRangeChange: (next: RangeKind) => void;
  anchor: Date;
  onAnchorChange: (next: Date) => void;
  onShiftAnchor: (direction: -1 | 1) => void;
};

const RANGES: Array<{ key: RangeKind; label: string }> = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All Time' },
];

export function DashboardFilters({
  employees,
  scope,
  onScopeChange,
  range,
  onRangeChange,
  anchor,
  onAnchorChange,
  onShiftAnchor,
}: DashboardFiltersProps): JSX.Element {
  const anchorLabel = (() => {
    switch (range) {
      case 'week':
        return `Week of ${format(anchor, 'MMM d, yyyy')}`;
      case 'month':
        return format(startOfMonth(anchor), 'MMMM yyyy');
      case 'year':
        return String(startOfYear(anchor).getFullYear());
      case 'all':
        return 'All Time';
      default:
        return '';
    }
  })();

  return (
    <div className="flex flex-wrap items-center gap-3 no-print">
      <div className="inline-flex items-center gap-2">
        <label className="text-sm text-muted" htmlFor="scope">
          Scope
        </label>
        <select
          id="scope"
          value={scope.kind === 'all' ? '__all__' : scope.tabName}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__all__') onScopeChange({ kind: 'all' });
            else onScopeChange({ kind: 'employee', tabName: v });
          }}
          className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm"
        >
          <option value="__all__">All employees</option>
          {employees
            .filter((e) => e.active)
            .map((e) => (
              <option key={e.tabName} value={e.tabName}>
                {e.displayName}
              </option>
            ))}
        </select>
      </div>

      <div
        className="inline-flex rounded-md border border-border overflow-hidden"
        role="group"
        aria-label="Range"
      >
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onRangeChange(r.key)}
            aria-pressed={range === r.key}
            className={clsx(
              'px-3 py-1.5 text-sm transition-colors',
              range === r.key
                ? 'bg-primary text-primary-fg'
                : 'bg-surface-2 hover:bg-border',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {range !== 'all' ? (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => onShiftAnchor(-1)}
            aria-label={`Previous ${range}`}
            className="p-1.5 rounded-md hover:bg-surface-2"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onAnchorChange(new Date())}
            className="text-sm px-3 py-1.5 rounded-md border border-border bg-surface hover:bg-surface-2"
          >
            {anchorLabel}
          </button>
          <button
            type="button"
            onClick={() => onShiftAnchor(1)}
            aria-label={`Next ${range}`}
            className="p-1.5 rounded-md hover:bg-surface-2"
          >
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        </div>
      ) : (
        <span className="text-sm text-muted">{anchorLabel}</span>
      )}
    </div>
  );
}
