import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useSheet } from '@/contexts/SheetContext';
import { useSheetRunner } from '@/hooks/useSheetData';
import { useWeekNav } from '@/hooks/useWeekNav';
import { EmployeeDropdown } from '@/components/ui/EmployeeDropdown';
import { WeekStrip } from '@/components/entry/WeekStrip';
import { DayPanel } from '@/components/entry/DayPanel';
import {
  appendRows,
  deleteRow as clearRow,
  readEmployeeSlots,
  slotToRowDerived,
  toISODate,
  updateRow,
} from '@/lib/sheetsApi';
import { dayAbbrev, formatWeekRange, parseISODate } from '@/lib/dateUtils';
import { calculateHours, formatHours, isValidHHMM } from '@/lib/timeUtils';
import { EMPLOYEE_RANGE } from '@/lib/constants';
import type { Slot, SlotType } from '@/types';

type PendingState = { saving?: boolean; error?: string | null };
type PendingMap = Record<string, PendingState>;

function newSlot(date: string, slotType: SlotType): Slot {
  const day = (() => {
    const d = parseISODate(date);
    return d ? dayAbbrev(d) : '';
  })();
  return {
    slotId:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    rowIndex: undefined,
    date,
    day,
    slotType,
    start: '',
    end: '',
    hours: 0,
    notes: '',
  };
}

export function EntryPage(): JSX.Element {
  const { sheetId, activeEmployees, settings, status } = useSheet();
  const run = useSheetRunner();

  const [selectedTab, setSelectedTab] = useState<string>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMap>({});

  const week = useWeekNav(settings.timezone);

  // Pick a sensible default employee when active list changes.
  useEffect(() => {
    if (selectedTab && activeEmployees.some((e) => e.tabName === selectedTab)) return;
    const first = activeEmployees[0];
    if (first) setSelectedTab(first.tabName);
  }, [activeEmployees, selectedTab]);

  const reload = useCallback(async (): Promise<void> => {
    if (!selectedTab || !sheetId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const fresh = await run((t) => readEmployeeSlots(sheetId, selectedTab, t));
      setSlots(fresh);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [run, sheetId, selectedTab]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    }
    return map;
  }, [slots]);

  // Smart default day selection: the first day in the current week with no entries.
  useEffect(() => {
    if (!week.weekDaysISO.includes(week.selectedDate)) return;
    const emptyDay = week.weekDaysISO.find(
      (iso) => (slotsByDate.get(iso)?.length ?? 0) === 0,
    );
    if (emptyDay && week.selectedDate !== emptyDay) {
      // Only auto-pick if the currently selected day has entries AND a more
      // natural empty day is available — don't fight the user.
      const currentHasEntries = (slotsByDate.get(week.selectedDate)?.length ?? 0) > 0;
      if (!currentHasEntries) return;
      // Intentionally not auto-advancing; preserve the user's selection.
    }
    // Intentional no-op below — kept for clarity that smart selection only
    // fires on initial load, not on every slot change.
    void emptyDay;
  }, [slotsByDate, week.selectedDate, week.weekDaysISO]);

  const markPending = (slotId: string, next: PendingState): void => {
    setPending((prev) => ({ ...prev, [slotId]: { ...prev[slotId], ...next } }));
  };

  const clearPending = (slotId: string): void => {
    setPending((prev) => {
      const copy = { ...prev };
      delete copy[slotId];
      return copy;
    });
  };

  const persistSlot = useCallback(
    async (slot: Slot): Promise<void> => {
      // Only persist once we have a complete start + end pair.
      if (!isValidHHMM(slot.start) || !isValidHHMM(slot.end)) return;
      markPending(slot.slotId, { saving: true, error: null });
      const row = slotToRowDerived({
        date: slot.date,
        slotType: slot.slotType,
        start: slot.start,
        end: slot.end,
        hours: calculateHours(slot.start, slot.end, slot.slotType),
        notes: slot.notes,
      });
      try {
        if (slot.rowIndex === undefined) {
          // Append. After append, re-read to get the fresh rowIndex for this row.
          await run((t) => appendRows(sheetId, selectedTab, [row], t, EMPLOYEE_RANGE));
          await reload();
        } else {
          await run((t) =>
            updateRow(
              sheetId,
              selectedTab,
              slot.rowIndex as number,
              row,
              t,
              `A${slot.rowIndex}:G${slot.rowIndex}`,
            ),
          );
        }
        clearPending(slot.slotId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        markPending(slot.slotId, { saving: false, error: msg });
        toast.error(`Save failed: ${msg}`);
      }
    },
    [run, sheetId, selectedTab, reload],
  );

  const handleSlotChange = useCallback(
    (slotId: string, partial: Partial<Slot>): void => {
      setSlots((prev) => {
        const next = prev.map((s) => (s.slotId === slotId ? { ...s, ...partial } : s));
        const target = next.find((s) => s.slotId === slotId);
        if (target) void persistSlot(target);
        return next;
      });
    },
    [persistSlot],
  );

  const handleSlotDelete = useCallback(
    (slotId: string): void => {
      let snapshot: Slot | undefined;
      setSlots((prev) => {
        snapshot = prev.find((s) => s.slotId === slotId);
        return prev.filter((s) => s.slotId !== slotId);
      });
      const target = snapshot;
      if (!target) return;
      clearPending(slotId);
      if (target.rowIndex !== undefined) {
        void run((t) => clearRow(sheetId, selectedTab, target.rowIndex as number, t)).catch(
          (err) => {
            toast.error(
              `Delete failed — restoring row: ${err instanceof Error ? err.message : String(err)}`,
            );
            setSlots((prev) => [...prev, target]);
          },
        );
      }
    },
    [run, sheetId, selectedTab],
  );

  const handleAddSlot = useCallback(
    (slotType: SlotType): void => {
      const fresh = newSlot(week.selectedDate, slotType);
      setSlots((prev) => [...prev, fresh]);
    },
    [week.selectedDate],
  );

  const handleSlotRetry = useCallback(
    (slotId: string): void => {
      const slot = slots.find((s) => s.slotId === slotId);
      if (slot) void persistSlot(slot);
    },
    [slots, persistSlot],
  );

  const weekTotal = useMemo(
    () =>
      week.weekDaysISO.reduce(
        (sum, iso) => sum + (slotsByDate.get(iso)?.reduce((a, s) => a + s.hours, 0) ?? 0),
        0,
      ),
    [week.weekDaysISO, slotsByDate],
  );

  const currentDaySlots = slotsByDate.get(week.selectedDate) ?? [];

  if (status !== 'ready') {
    return (
      <section className="p-6">
        <p className="text-muted">Waiting on sheet data…</p>
      </section>
    );
  }

  if (activeEmployees.length === 0) {
    return (
      <section className="p-6">
        <div className="rounded-md border border-border bg-surface p-4 text-sm">
          <p>
            No active employees. Add one in{' '}
            <a href="/settings" className="text-primary underline-offset-2 hover:underline">
              Settings
            </a>
            .
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="p-6 space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <EmployeeDropdown
          employees={activeEmployees}
          value={selectedTab}
          onChange={setSelectedTab}
        />
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={week.gotoPrevWeek}
            aria-label="Previous week"
            className="p-2 rounded-md hover:bg-surface-2"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={week.gotoThisWeek}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border bg-surface hover:bg-surface-2"
          >
            <Calendar className="w-4 h-4" aria-hidden />
            <span>{formatWeekRange(week.sunday)}</span>
          </button>
          <button
            type="button"
            onClick={week.gotoNextWeek}
            aria-label="Next week"
            className="p-2 rounded-md hover:bg-surface-2"
          >
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        </div>
        <div className="ml-auto font-mono tabular-nums text-sm text-muted">
          Week total:{' '}
          <span className="text-fg font-medium">{formatHours(weekTotal)}h</span>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-medium text-danger">Couldn't load slots</p>
          <p className="mt-1 text-fg/80">{loadError}</p>
        </div>
      ) : null}

      <WeekStrip
        sunday={week.sunday}
        selectedDate={week.selectedDate}
        slotsByDate={slotsByDate}
        onSelect={week.setSelectedDate}
      />

      {loading && slots.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          Loading…
        </div>
      ) : (
        <DayPanel
          date={week.selectedDate}
          slots={currentDaySlots}
          displayMode={settings.displayMode}
          pendingBySlotId={pending}
          onSlotChange={handleSlotChange}
          onSlotDelete={handleSlotDelete}
          onSlotRetry={handleSlotRetry}
          onAddSlot={handleAddSlot}
        />
      )}

      <p className="text-xs text-muted">
        Saved on blur of the End time field. {' '}
        <kbd className="px-1 py-0.5 rounded bg-surface-2 border border-border text-xs">
          ← / →
        </kbd>{' '}
        to change day.
      </p>

      <span className="sr-only">{toISODate(week.sunday)}</span>
    </section>
  );
}
