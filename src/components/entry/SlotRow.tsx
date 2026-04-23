import { X } from 'lucide-react';
import clsx from 'clsx';
import { TimeInput } from './TimeInput';
import { calculateHours, formatHours, isValidHHMM } from '@/lib/timeUtils';
import type { DisplayMode, Slot } from '@/types';

export type SlotRowProps = {
  slot: Slot;
  displayMode: DisplayMode;
  onChange: (partial: Partial<Slot>) => void;
  onDelete: () => void;
  /** True while an in-flight write is resolving for this slot. */
  saving?: boolean;
  /** Inline error message to show (e.g. "save failed — retry"). */
  error?: string | null;
  onRetry?: () => void;
};

export function SlotRow({
  slot,
  displayMode,
  onChange,
  onDelete,
  saving,
  error,
  onRetry,
}: SlotRowProps): JSX.Element {
  const isBreak = slot.slotType === 'break';
  const complete = isValidHHMM(slot.start) && isValidHHMM(slot.end);
  const hours = complete ? calculateHours(slot.start, slot.end, slot.slotType) : slot.hours;

  return (
    <div
      className={clsx(
        'flex items-center gap-3 py-2 px-3 rounded-md border transition-colors',
        isBreak ? 'bg-surface-2 border-border/60' : 'bg-surface border-border',
      )}
    >
      <span
        className={clsx(
          'inline-flex items-center justify-center text-xs font-medium rounded px-2 py-0.5 w-16 select-none',
          isBreak ? 'bg-muted/20 text-muted' : 'bg-primary/10 text-primary',
        )}
      >
        {isBreak ? 'Break' : 'Work'}
      </span>

      <TimeInput
        value={slot.start}
        displayMode={displayMode}
        ariaLabel={`${isBreak ? 'Break' : 'Work'} start time`}
        onCommit={(v) => {
          const nextHours =
            isValidHHMM(v) && isValidHHMM(slot.end)
              ? calculateHours(v, slot.end, slot.slotType)
              : 0;
          onChange({ start: v, hours: nextHours });
        }}
      />

      <span className="text-muted select-none" aria-hidden>
        →
      </span>

      <TimeInput
        value={slot.end}
        displayMode={displayMode}
        ariaLabel={`${isBreak ? 'Break' : 'Work'} end time`}
        onCommit={(v) => {
          const nextHours =
            isValidHHMM(slot.start) && isValidHHMM(v)
              ? calculateHours(slot.start, v, slot.slotType)
              : 0;
          onChange({ end: v, hours: nextHours });
        }}
      />

      <span
        className={clsx(
          'font-mono tabular-nums text-sm w-20 text-right',
          complete ? 'text-fg' : 'text-muted',
          isBreak && 'text-muted',
        )}
      >
        {complete ? `${formatHours(hours)}h` : '—'}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {saving ? (
          <span className="text-xs text-muted animate-pulse">Saving…</span>
        ) : null}
        {error ? (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs text-danger underline-offset-2 hover:underline"
            title={error}
          >
            Retry
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${isBreak ? 'break' : 'work'} slot`}
          className="p-1 rounded hover:bg-danger/10 text-muted hover:text-danger"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
