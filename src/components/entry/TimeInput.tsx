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
  /** Fired the moment the user finishes the 4th digit that produces a valid HH:MM. */
  onAutoComplete?: () => void;
  /** Fired on Ctrl+Enter / Meta+Enter — handled at the row level to add another slot. */
  onCtrlEnter?: () => void;
};

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(function TimeInput(
  { value, onCommit, displayMode, placeholder = 'HH:MM', ariaLabel, className, disabled, onEnter, onEscape, onAutoComplete, onCtrlEnter },
  ref,
) {
  const [draft, setDraft] = useState<string>(value ? formatForDisplay(value, displayMode) : '');
  const [focused, setFocused] = useState(false);
  const lastCommittedRef = useRef<string>(value);
  const lastDigitsCountRef = useRef<number>(0);

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
      if ((e.ctrlKey || e.metaKey) && onCtrlEnter) {
        onCtrlEnter();
      } else {
        onEnter?.();
      }
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
        lastDigitsCountRef.current = (draft.match(/\d/g) ?? []).length;
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
        const formatted = autoFormat4Digit(cleaned);
        setDraft(formatted);
        // Auto-commit + fire onAutoComplete the moment we reach 4 digits and the
        // result is a valid HH:MM. This makes "0700[Tab-less]" flow possible —
        // the parent wires onAutoComplete on Start → focus End.
        const digitsCount = (cleaned.match(/\d/g) ?? []).length;
        if (
          digitsCount >= 4 &&
          lastDigitsCountRef.current < 4 &&
          isValidHHMM(formatted)
        ) {
          commit(formatted);
          onAutoComplete?.();
        }
        lastDigitsCountRef.current = digitsCount;
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
