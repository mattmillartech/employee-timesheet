import clsx from 'clsx';
import { addDays, format } from '@/lib/dateUtils';
import { formatHours } from '@/lib/timeUtils';
import { toISODate } from '@/lib/sheetsApi';
import { DAY_ABBREVIATIONS } from '@/lib/constants';
import type { Slot } from '@/types';

export type WeekStripProps = {
  sunday: Date;
  selectedDate: string;
  slotsByDate: Map<string, Slot[]>;
  onSelect: (iso: string) => void;
};

export function WeekStrip({
  sunday,
  selectedDate,
  slotsByDate,
  onSelect,
}: WeekStripProps): JSX.Element {
  const days = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));

  return (
    <div
      role="tablist"
      aria-label="Week days"
      className="grid grid-cols-7 gap-2"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const idx = days.findIndex((d) => toISODate(d) === selectedDate);
        const next =
          e.key === 'ArrowRight'
            ? Math.min(6, idx + 1)
            : Math.max(0, idx - 1);
        const day = days[next];
        if (day) onSelect(toISODate(day));
      }}
    >
      {days.map((d, i) => {
        const iso = toISODate(d);
        const total = (slotsByDate.get(iso) ?? []).reduce((sum, s) => sum + s.hours, 0);
        const isSelected = iso === selectedDate;
        const hasEntries = total !== 0;
        return (
          <button
            key={iso}
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            type="button"
            onClick={() => onSelect(iso)}
            className={clsx(
              'flex flex-col items-center justify-center rounded-lg border py-3 px-2 transition-colors',
              isSelected
                ? 'bg-primary text-primary-fg border-primary shadow-sm'
                : 'bg-surface border-border hover:bg-surface-2',
            )}
          >
            <span
              className={clsx(
                'text-xs font-medium tracking-wide',
                isSelected ? 'text-primary-fg/90' : 'text-muted',
              )}
            >
              {DAY_ABBREVIATIONS[i]}
            </span>
            <span
              className={clsx(
                'text-lg font-semibold tabular-nums',
                isSelected ? 'text-primary-fg' : 'text-fg',
              )}
            >
              {format(d, 'd')}
            </span>
            <span
              className={clsx(
                'text-xs tabular-nums mt-1',
                isSelected
                  ? 'text-primary-fg/90'
                  : hasEntries
                    ? 'text-success'
                    : 'text-muted/60',
              )}
            >
              {hasEntries ? `${formatHours(total)}h` : '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
