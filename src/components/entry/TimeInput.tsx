import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import clsx from 'clsx';
import {
  autoFormat4Digit,
  formatForDisplay,
  isValidHHMM,
  normalizeTimeInput,
} from '@/lib/timeUtils';
import type { DisplayMode } from '@/types';

export type TimeInputProps = {
  value: string; // stored as HH:MM (24h) or empty
  onCommit: (next: string) => void;
  displayMode: DisplayMode;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onEnter?: () => void;
  onEscape?: () => void;
};

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(function TimeInput(
  { value, onCommit, displayMode, placeholder = 'HH:MM', ariaLabel, className, disabled, onEnter, onEscape },
  ref,
) {
  const [draft, setDraft] = useState<string>(value ? formatForDisplay(value, displayMode) : '');
  const [focused, setFocused] = useState(false);
  const lastCommittedRef = useRef<string>(value);

  // Sync external value into the draft when not focused.
  useEffect(() => {
    if (!focused) {
      setDraft(value ? formatForDisplay(value, displayMode) : '');
      lastCommittedRef.current = value;
    }
  }, [value, displayMode, focused]);

  const commit = (raw: string): void => {
    const normalized = normalizeTimeInput(raw);
    if (normalized === null) {
      // Invalid — revert display to last committed value.
      setDraft(lastCommittedRef.current ? formatForDisplay(lastCommittedRef.current, displayMode) : '');
      return;
    }
    if (normalized !== lastCommittedRef.current) {
      lastCommittedRef.current = normalized;
      onCommit(normalized);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(lastCommittedRef.current ? formatForDisplay(lastCommittedRef.current, displayMode) : '');
      (e.currentTarget as HTMLInputElement).blur();
      onEscape?.();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(draft);
      onEnter?.();
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={focused ? draft : value ? formatForDisplay(value, displayMode) : ''}
      onFocus={(e) => {
        setFocused(true);
        // Select everything so a fresh type replaces the value.
        setTimeout(() => e.target.select(), 0);
      }}
      onBlur={() => {
        setFocused(false);
        commit(draft);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // Only keep digits / colon / space / AM / PM for readable display
        const cleaned = raw.replace(/[^\d:apm\s]/gi, '');
        setDraft(autoFormat4Digit(cleaned));
      }}
      onKeyDown={handleKeyDown}
      className={clsx(
        'font-mono tabular-nums text-center rounded-md border bg-surface-2',
        'px-2 py-1.5 w-24 text-sm',
        'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        !isValidHHMM(value) && value !== ''
          ? 'border-danger/60'
          : 'border-border',
        className,
      )}
    />
  );
});
