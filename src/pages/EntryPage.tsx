import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  updateRow,
} from '@/lib/sheetsApi';
import { dayAbbrev, formatWeekRange, parseISODate } from '@/lib/dateUtils';
import { calculateHours, formatHours, isValidHHMM } from '@/lib/timeUtils';
import { EMPLOYEE_RANGE } from '@/lib/constants';
import type { Slot, SlotType } from '@/types';

type PendingState = { saving?: boolean; error?: string | null };
type PendingMap = Record<string, PendingState>;
type FocusTarget = { slotId: string; field: 'start' | 'end' };

function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <kbd className="inline-block px-1.5 py-0.5 rounded border border-border bg-surface text-fg font-mono text-[11px] leading-none align-middle mr-1 last:mr-0">
      {children}
    </kbd>
  );
}

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

  // Ref registry — SlotRow calls registerInput(slotId, field, el) on mount/unmount,
  // EntryPage uses it to programmatically focus the "next logical field".
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingFocusRef = useRef<FocusTarget | null>(null);
  // Tracks whether we've applied the smart-default-day pick for the current
  // (employee, week) combo — prevents us from fighting the user on every render.
  const smartDefaultAppliedRef = useRef<string>('');

  const registerInputFor = useCallback(
    (slotId: string) => (field: 'start' | 'end', el: HTMLInputElement | null): void => {
      const key = `${slotId}:${field}`;
      if (el) inputRefs.current.set(key, el);
      else inputRefs.current.delete(key);
    },
    [],
  );

  const focusSlot = useCallback((target: FocusTarget): boolean => {
    const el = inputRefs.current.get(`${target.slotId}:${target.field}`);
    if (el) {
      el.focus();
      el.select();
      return true;
    }
    return false;
  }, []);

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

  // Smart default day: on employee/week change, jump to the first day of this
  // week that has no entries. If every day is populated, leave Sunday selected.
  useEffect(() => {
    if (loading || !selectedTab) return;
    const key = `${selectedTab}:${week.weekDaysISO[0] ?? ''}`;
    if (smartDefaultAppliedRef.current === key) return;
    for (const iso of week.weekDaysISO) {
      if ((slotsByDate.get(iso)?.length ?? 0) === 0) {
        if (week.selectedDate !== iso) week.setSelectedDate(iso);
        smartDefaultAppliedRef.current = key;
        return;
      }
    }
    smartDefaultAppliedRef.current = key;
  }, [loading, selectedTab, slotsByDate, week]);

  // Auto-add one empty work slot whenever the selected day has none — so the
  // admin lands on a ready-to-type row without clicking "Add work slot".
  useEffect(() => {
    if (loading || !selectedTab) return;
    const current = slotsByDate.get(week.selectedDate) ?? [];
    if (current.length === 0) {
      const fresh = newSlot(week.selectedDate, 'work');
      setSlots((prev) => [...prev, fresh]);
      pendingFocusRef.current = { slotId: fresh.slotId, field: 'start' };
    }
  }, [loading, selectedTab, week.selectedDate, slotsByDate]);

  // Consume pendingFocusRef after each render — the new input has had a chance
  // to mount and register itself, so we can now focus it.
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    const target = pendingFocusRef.current;
    const id = window.setTimeout(() => {
      if (focusSlot(target)) {
        pendingFocusRef.current = null;
      }
    }, 0);
    return () => window.clearTimeout(id);
  });

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
    (slotType: SlotType): Slot => {
      const fresh = newSlot(week.selectedDate, slotType);
      setSlots((prev) => [...prev, fresh]);
      pendingFocusRef.current = { slotId: fresh.slotId, field: 'start' };
      return fresh;
    },
    [week.selectedDate],
  );

  // Ctrl+Enter inside any slot row — add another work slot to the same day and
  // immediately focus its Start field.
  const handleAddAnother = useCallback((): void => {
    handleAddSlot('work');
  }, [handleAddSlot]);

  // Enter on the End field — save (already committed via TimeInput), then
  // advance focus to the next logical field:
  //   1. A later slot on this day with an empty Start or End
  //   2. Otherwise, the next day in the week that has no entries (auto-adds an
  //      empty work slot via the day-change effect)
  //   3. If every day has entries, add a fresh slot to the current day
  const handleEndEnter = useCallback(
    (fromSlotId: string): void => {
      const currentDaySlots = slotsByDate.get(week.selectedDate) ?? [];
      const idx = currentDaySlots.findIndex((s) => s.slotId === fromSlotId);
      for (let i = idx + 1; i < currentDaySlots.length; i++) {
        const s = currentDaySlots[i];
        if (!s) continue;
        if (!isValidHHMM(s.start)) {
          pendingFocusRef.current = { slotId: s.slotId, field: 'start' };
          return;
        }
        if (!isValidHHMM(s.end)) {
          pendingFocusRef.current = { slotId: s.slotId, field: 'end' };
          return;
        }
      }
      // No more incomplete slots on this day — advance to the next day that
      // either has no entries OR has an incomplete slot.
      const days = week.weekDaysISO;
      const currentIdx = days.indexOf(week.selectedDate);
      for (let step = 1; step <= days.length; step++) {
        const nextIdx = (currentIdx + step) % days.length;
        const nextDate = days[nextIdx];
        if (!nextDate) continue;
        const list = slotsByDate.get(nextDate) ?? [];
        if (list.length === 0) {
          week.setSelectedDate(nextDate);
          // Day-change effect will auto-add the empty slot + set pendingFocus.
          return;
        }
        const incomplete = list.find((s) => !isValidHHMM(s.start) || !isValidHHMM(s.end));
        if (incomplete) {
          week.setSelectedDate(nextDate);
          pendingFocusRef.current = {
            slotId: incomplete.slotId,
            field: isValidHHMM(incomplete.start) ? 'end' : 'start',
          };
          return;
        }
      }
      // Every day in this week has complete entries. Add a new slot here so
      // the user can keep typing without hunting for the "Add slot" button.
      handleAddSlot('work');
    },
    [slotsByDate, week, handleAddSlot],
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
          onAddSlot={(type) => void handleAddSlot(type)}
          registerInputFor={registerInputFor}
          onEndEnter={handleEndEnter}
          onAddAnother={handleAddAnother}
        />
      )}

      <aside
        aria-label="Keyboard shortcuts"
        className="rounded-lg border border-border/70 bg-surface-2/60 p-3 text-xs no-print"
      >
        <div className="font-medium text-fg mb-2">Keyboard shortcuts</div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-muted">
          <li>
            <Kbd>0700</Kbd>
            <span className="ml-2">
              Type 4 digits — auto-formats to <span className="font-mono">07:00</span> and
              hops to the End field
            </span>
          </li>
          <li>
            <Kbd>Tab</Kbd>
            <span className="ml-2">Start → End within the same slot</span>
          </li>
          <li>
            <Kbd>Enter</Kbd>
            <span className="ml-2">
              Save + advance to next empty field (next day once this day is done)
            </span>
          </li>
          <li>
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd>
            <span className="ml-2">Add another slot to the current day</span>
          </li>
          <li>
            <Kbd>Esc</Kbd>
            <span className="ml-2">Cancel current edit, revert to saved value</span>
          </li>
          <li>
            <Kbd>←</Kbd>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <Kbd>→</Kbd>
            <span className="ml-2">Change day (from the week strip)</span>
          </li>
        </ul>
      </aside>
    </section>
  );
}
