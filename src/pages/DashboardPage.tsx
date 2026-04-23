import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RefreshCw, FileSpreadsheet } from 'lucide-react';
import { useSheet } from '@/contexts/SheetContext';
import { useSheetRunner } from '@/hooks/useSheetData';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { WeekViewTable } from '@/components/dashboard/WeekViewTable';
import { RangeSummaryTable } from '@/components/dashboard/RangeSummaryTable';
import { DashboardExport } from '@/components/dashboard/DashboardExport';
import { aggregate } from '@/lib/dashboardAggregator';
import {
  initOrRebuildDashboardTab,
  readEmployeeSlots,
} from '@/lib/sheetsApi';
import { nowInTimezone, shiftRange } from '@/lib/dateUtils';
import type { DashboardScope, RangeKind, Slot } from '@/types';

export function DashboardPage(): JSX.Element {
  const { sheetId, status, error, employees, activeEmployees, settings } = useSheet();
  const run = useSheetRunner();
  const navigate = useNavigate();

  const [scope, setScope] = useState<DashboardScope>({ kind: 'all' });
  const [range, setRange] = useState<RangeKind>('week');
  const [anchor, setAnchor] = useState<Date>(() => nowInTimezone(settings.timezone));
  const [slotsByEmployee, setSlotsByEmployee] = useState<Map<string, Slot[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const employeesToLoad = useMemo(
    () =>
      scope.kind === 'all'
        ? activeEmployees
        : activeEmployees.filter((e) => e.tabName === scope.tabName),
    [activeEmployees, scope],
  );

  const loadSlots = useCallback(async (): Promise<void> => {
    if (!sheetId) return;
    if (employeesToLoad.length === 0) {
      setSlotsByEmployee(new Map());
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const results = await Promise.all(
        employeesToLoad.map(async (e) => {
          const slots = await run((t) => readEmployeeSlots(sheetId, e.tabName, t));
          return [e.tabName, slots] as const;
        }),
      );
      const map = new Map<string, Slot[]>();
      for (const [tab, slots] of results) map.set(tab, slots);
      setSlotsByEmployee(map);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [employeesToLoad, run, sheetId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const view = useMemo(
    () =>
      aggregate({
        employees,
        slotsByEmployee,
        range,
        anchor,
        scope,
      }),
    [employees, slotsByEmployee, range, anchor, scope],
  );

  const handleShiftAnchor = (direction: -1 | 1): void => {
    setAnchor((prev) => shiftRange(range, prev, direction));
  };

  const handleSyncToSheet = async (): Promise<void> => {
    setSyncing(true);
    try {
      await run((t) => initOrRebuildDashboardTab(sheetId, activeEmployees, t));
      toast.success('Dashboard tab rebuilt in the Google Sheet.');
    } catch (err) {
      toast.error(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleWeekCellClick = (tabName: string, dateISO: string): void => {
    navigate(`/entry?employee=${encodeURIComponent(tabName)}&date=${encodeURIComponent(dateISO)}`);
  };

  if (status === 'loading') {
    return (
      <section className="p-6">
        <p className="text-muted">Loading sheet data…</p>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="p-6">
        <div className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm">
          <p className="font-medium text-danger">Couldn't load sheet</p>
          <p className="mt-1 text-fg/80">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="p-6 space-y-4">
      <header className="flex flex-wrap items-start gap-3 justify-between">
        <div>
          <h2 className="text-xl font-semibold">Dashboard</h2>
          <p className="text-muted text-sm">
            Aggregated hours across employees and periods. Week view shows the day's{' '}
            earliest start and latest end time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardExport view={view} />
          <button
            type="button"
            onClick={() => void handleSyncToSheet()}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-60 no-print"
            title="Rebuild the Dashboard tab in the Google Sheet"
          >
            <FileSpreadsheet className="w-4 h-4" aria-hidden />
            <span>{syncing ? 'Syncing…' : 'Sync to sheet'}</span>
          </button>
          <button
            type="button"
            onClick={() => void loadSlots()}
            disabled={loading}
            aria-label="Refresh"
            className="p-1.5 rounded-md border border-border bg-surface hover:bg-surface-2 disabled:opacity-60 no-print"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </div>
      </header>

      <DashboardFilters
        employees={activeEmployees}
        scope={scope}
        onScopeChange={setScope}
        range={range}
        onRangeChange={setRange}
        anchor={anchor}
        onAnchorChange={setAnchor}
        onShiftAnchor={handleShiftAnchor}
      />

      {loadError ? (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-medium text-danger">Load failed</p>
          <p className="mt-1 text-fg/80">{loadError}</p>
        </div>
      ) : null}

      {activeEmployees.length === 0 ? (
        <div className="rounded-md border border-border bg-surface p-4 text-sm">
          <p>
            No active employees. Add one in{' '}
            <a href="/settings" className="text-primary underline-offset-2 hover:underline">
              Settings
            </a>
            .
          </p>
        </div>
      ) : view.kind === 'week' ? (
        <WeekViewTable
          view={view}
          displayMode={settings.displayMode}
          onCellClick={handleWeekCellClick}
        />
      ) : (
        <RangeSummaryTable view={view} />
      )}
    </section>
  );
}
