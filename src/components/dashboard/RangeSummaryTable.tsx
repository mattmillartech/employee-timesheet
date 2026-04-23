import { formatHoursShort } from '@/lib/timeUtils';
import type { AllTimeView, MonthView, YearView } from '@/lib/dashboardAggregator';
import { format, parseISODate } from '@/lib/dateUtils';

export type RangeSummaryTableProps = {
  view: MonthView | YearView | AllTimeView;
};

export function RangeSummaryTable({ view }: RangeSummaryTableProps): JSX.Element {
  if (view.kind === 'month') return <MonthTable view={view} />;
  if (view.kind === 'year') return <YearTable view={view} />;
  return <AllTimeTable view={view} />;
}

function MonthTable({ view }: { view: MonthView }): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="text-left font-medium text-muted px-4 py-2.5">
              Employee
            </th>
            {view.weekStartsISO.map((iso) => {
              const d = parseISODate(iso);
              return (
                <th scope="col" key={iso} className="text-center font-medium text-muted px-3 py-2.5">
                  <div className="text-xs">Week of</div>
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
          {view.rows.map((row) => (
            <tr key={row.employee.tabName} className="border-b border-border/60 last:border-0">
              <th scope="row" className="text-left font-medium px-4 py-2.5">
                {row.employee.displayName}
              </th>
              {row.cells.map((v, i) => (
                <td
                  key={i}
                  className="px-3 py-2 text-center font-mono border-l border-border/40"
                >
                  {v === 0 ? '—' : `${formatHoursShort(v)}h`}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right font-mono font-medium border-l border-border/40">
                {formatHoursShort(row.rowTotal)}h
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

function YearTable({ view }: { view: YearView }): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="text-left font-medium text-muted px-4 py-2.5">
              Employee
            </th>
            {view.monthLabels.map((m) => (
              <th
                scope="col"
                key={m}
                className="text-center font-medium text-muted px-3 py-2.5 min-w-16"
              >
                {m}
              </th>
            ))}
            <th scope="col" className="text-right font-medium text-fg px-4 py-2.5">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.employee.tabName} className="border-b border-border/60 last:border-0">
              <th scope="row" className="text-left font-medium px-4 py-2.5">
                {row.employee.displayName}
              </th>
              {row.cells.map((v, i) => (
                <td key={i} className="px-3 py-2 text-center font-mono border-l border-border/40">
                  {v === 0 ? '—' : formatHoursShort(v)}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right font-mono font-medium border-l border-border/40">
                {formatHoursShort(row.rowTotal)}h
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
                {t === 0 ? '—' : formatHoursShort(t)}
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

function AllTimeTable({ view }: { view: AllTimeView }): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="text-left font-medium text-muted px-4 py-2.5">
              Employee
            </th>
            <th scope="col" className="text-left font-medium text-muted px-4 py-2.5">
              First Entry
            </th>
            <th scope="col" className="text-left font-medium text-muted px-4 py-2.5">
              Last Entry
            </th>
            <th scope="col" className="text-right font-medium text-muted px-4 py-2.5">
              Days Worked
            </th>
            <th scope="col" className="text-right font-medium text-fg px-4 py-2.5">
              Total Hours
            </th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.employee.tabName} className="border-b border-border/60 last:border-0">
              <th scope="row" className="text-left font-medium px-4 py-2.5">
                {row.employee.displayName}
              </th>
              <td className="px-4 py-2.5 font-mono text-muted">{row.firstEntry ?? '—'}</td>
              <td className="px-4 py-2.5 font-mono text-muted">{row.lastEntry ?? '—'}</td>
              <td className="px-4 py-2.5 text-right font-mono">{row.daysWorked}</td>
              <td className="px-4 py-2.5 text-right font-mono font-medium">
                {formatHoursShort(row.totalHours)}h
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface-2 font-medium">
            <th scope="row" className="text-left px-4 py-2.5" colSpan={4}>
              GRAND TOTAL
            </th>
            <td className="px-4 py-2.5 text-right font-mono">
              {formatHoursShort(view.grandTotal)}h
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
