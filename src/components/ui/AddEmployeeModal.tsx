import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { slugify } from '@/lib/slugify';
import type { Employee } from '@/types';

export type AddEmployeeModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { displayName: string; tabName: string }) => Promise<void>;
  existing: readonly Employee[];
};

export function AddEmployeeModal({
  open,
  onClose,
  onCreate,
  existing,
}: AddEmployeeModalProps): JSX.Element | null {
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDisplayName('');
      setError(null);
      setSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const tabName = slugify(displayName);
  const collision = tabName !== '' && existing.some((e) => e.tabName === tabName);

  const canSubmit = !submitting && tabName.length > 0 && !collision;

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ displayName: displayName.trim(), tabName });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-employee-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-lg p-6 space-y-4">
        <header className="flex items-start justify-between">
          <div>
            <h2 id="add-employee-title" className="text-lg font-semibold">
              Add Employee
            </h2>
            <p className="text-sm text-muted">
              Creates a new tab in the Google Sheet with the standard columns.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-surface-2"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="emp-display-name">
            Display name
          </label>
          <input
            ref={inputRef}
            id="emp-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="e.g. Jane Smith"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted">
            Sheet tab name:{' '}
            <code className="font-mono">{tabName || '(type a name…)'}</code>
          </p>
          {collision ? (
            <p className="text-xs text-danger">
              An employee with that slug already exists. Try a distinct display name.
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
            <p className="font-medium text-danger">Create failed</p>
            <p className="mt-1 text-fg/80 break-words">{error}</p>
          </div>
        ) : null}

        <footer className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-md bg-primary text-primary-fg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating…' : 'Create Employee'}
          </button>
        </footer>
      </div>
    </div>
  );
}
