import { Plus, Coffee } from 'lucide-react';
import { SlotRow } from './SlotRow';
import { formatHours } from '@/lib/timeUtils';
import { format, parseISODate } from '@/lib/dateUtils';
import type { DisplayMode, Slot } from '@/types';

export type DayPanelProps = {
  date: string; // YYYY-MM-DD
  slots: Slot[];
  displayMode: DisplayMode;
  pendingBySlotId: Record<string, { saving?: boolean; error?: string | null }>;
  onSlotChange: (slotId: string, partial: Partial<Slot>) => void;
  onSlotDelete: (slotId: string) => void;
  onSlotRetry: (slotId: string) => void;
  onAddSlot: (slotType: 'work' | 'break') => void;
  registerInputFor?: (
    slotId: string,
  ) => (field: 'start' | 'end', el: HTMLInputElement | null) => void;
  onEndEnter?: (slotId: string) => void;
  onAddAnother?: () => void;
};

export function DayPanel({
  date,
  slots,
  displayMode,
  pendingBySlotId,
  onSlotChange,
  onSlotDelete,
  onSlotRetry,
  onAddSlot,
  registerInputFor,
  onEndEnter,
  onAddAnother,
}: DayPanelProps): JSX.Element {
  const d = parseISODate(date);
  const heading = d ? format(d, 'EEEE, MMMM d, yyyy') : date;
  const dayTotal = slots.reduce((sum, s) => sum + s.hours, 0);

  return (
    <section className="rounded-xl border border-border bg-bg/60 p-4 space-y-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">{heading}</h3>
        <span className="font-mono tabular-nums text-sm text-muted">
          Day total:{' '}
          <span className="text-fg font-medium">{formatHours(dayTotal)}h</span>
        </span>
      </header>

      {slots.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">
          No entries for this day. Add a work or break slot below.
        </p>
      ) : (
        <ul className="space-y-2">
          {slots.map((slot) => {
            const pending = pendingBySlotId[slot.slotId] ?? {};
            return (
              <li key={slot.slotId}>
                <SlotRow
                  slot={slot}
                  displayMode={displayMode}
                  saving={pending.saving}
                  error={pending.error ?? null}
                  onChange={(partial) => onSlotChange(slot.slotId, partial)}
                  onDelete={() => onSlotDelete(slot.slotId)}
                  onRetry={() => onSlotRetry(slot.slotId)}
                  registerInput={registerInputFor?.(slot.slotId)}
                  onEndEnter={() => onEndEnter?.(slot.slotId)}
                  onAddAnother={onAddAnother}
                />
              </li>
            );
          })}
        </ul>
      )}

      <footer className="flex items-center gap-2 pt-2 border-t border-border/60">
        <button
          type="button"
          onClick={() => onAddSlot('work')}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 text-primary border border-primary/30 px-3 py-1.5 text-sm font-medium hover:bg-primary/15"
        >
          <Plus className="w-4 h-4" aria-hidden />
          Add work slot
        </button>
        <button
          type="button"
          onClick={() => onAddSlot('break')}
          className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 text-fg border border-border px-3 py-1.5 text-sm font-medium hover:bg-border"
        >
          <Coffee className="w-4 h-4" aria-hidden />
          Add break
        </button>
      </footer>
    </section>
  );
}
