import clsx from 'clsx';
import { format, parseISODate } from '@/lib/dateUtils';
import { formatForDisplay, formatHoursShort } from '@/lib/timeUtils';
import type { WeekView } from '@/lib/dashboardAggregator';
import type { DisplayMode } from '@/types';

export type WeekViewTableProps = {
  view: WeekView;
  displayMode: DisplayMode;
  onCellClick?: (tabName: string, dateISO: string) => void;
};

export function WeekViewTable({ view, displayMode, onCellClick }: WeekViewTableProps): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="text-left font-medium text-muted px-4 py-2.5">
              Employee
            </th>
            {view.daysISO.map((iso) => {
              const d = parseISODate(iso);
              return (
                <th
                  scope="col"
                  key={iso}
                  className="text-center font-medium text-muted px-3 py-2.5 min-w-32"
                >
                  <div className="text-xs text-muted">{d ? format(d, 'EEE') : ''}</div>
                  <div className="text-fg text-sm">{d ? format(d, 'MMM d') : iso}</div>
                </th>
              );
            })}
            <th scope="col" className="text-right font-medium text-fg px-4 py-2.5">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {view.rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-muted">
                No active employees in scope.
              </td>
            </tr>
          ) : null}
          {view.rows.map((row) => (
            <tr key={row.employee.tabName} className="border-b border-border/60 last:border-0">
              <th scope="row" className="text-left font-medium px-4 py-2.5 whitespace-nowrap">
                {row.employee.displayName}
              </th>
              {row.cells.map((cell) => {
                const hasData = cell.totalHours !== 0;
                return (
                  <td
                    key={cell.date}
                    className={clsx(
                      'px-3 py-2 text-center border-l border-border/40',
                      hasData ? 'text-fg' : 'text-muted/70',
                      onCellClick && 'cursor-pointer hover:bg-surface-2',
                    )}
                    onClick={() => (hasData ? onCellClick?.(row.employee.tabName, cell.date) : undefined)}
                  >
                    {hasData ? (
                      <div className="space-y-0.5 leading-tight">
                        <div className="font-mono text-xs text-muted">
                          {cell.earliestStart
                            ? formatForDisplay(cell.earliestStart, displayMode)
                            : '—'}
                          {cell.latestEnd ? ` → ${formatForDisplay(cell.latestEnd, displayMode)}` : ''}
                        </div>
                        <div className="font-mono font-medium">
                          {formatHoursShort(cell.totalHours)}h
                        </div>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                );
              })}
              <td className="px-4 py-2.5 text-right font-mono font-medium border-l border-border/40">
                {row.rowTotal === 0 ? '—' : `${formatHoursShort(row.rowTotal)}h`}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface-2 font-medium">
            <th scope="row" className="text-left px-4 py-2.5">
              TOTAL
            </th>
            {view.columnTotals.map((t, i) => (
              <td key={i} className="px-3 py-2.5 text-center font-mono border-l border-border/40">
                {t === 0 ? '—' : `${formatHoursShort(t)}h`}
              </td>
            ))}
            <td className="px-4 py-2.5 text-right font-mono border-l border-border/40">
              {formatHoursShort(view.grandTotal)}h
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
