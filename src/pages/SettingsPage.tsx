import { useState } from 'react';
import { useSheet } from '@/contexts/SheetContext';
import { LOCALSTORAGE_SHEET_ID_KEY } from '@/lib/constants';

const COMMON_TIMEZONES = [
  'America/Toronto',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Halifax',
  'America/St_Johns',
  'UTC',
  'Europe/London',
  'Europe/Paris',
];

export function SettingsPage(): JSX.Element {
  const { sheetId, setSheetId, settings, setTimezone, setDisplayMode } = useSheet();
  const [sheetIdDraft, setSheetIdDraft] = useState(sheetId);
  const [savingTz, setSavingTz] = useState(false);

  const handleTimezoneChange = async (tz: string): Promise<void> => {
    setSavingTz(true);
    try {
      await setTimezone(tz);
    } finally {
      setSavingTz(false);
    }
  };

  return (
    <section className="p-6 max-w-2xl space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-muted text-sm">Full employee management lands in M5.</p>
      </header>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="sheet-id">
          Google Sheet ID
        </label>
        <div className="flex gap-2">
          <input
            id="sheet-id"
            type="text"
            value={sheetIdDraft}
            onChange={(e) => setSheetIdDraft(e.target.value)}
            className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-sm"
            placeholder="paste the opaque sheet ID from the URL"
          />
          <button
            type="button"
            onClick={() => setSheetId(sheetIdDraft)}
            className="rounded-md bg-primary text-primary-fg px-4 py-2 text-sm font-medium"
          >
            Save
          </button>
        </div>
        <p className="text-xs text-muted">
          Stored in <code>localStorage["{LOCALSTORAGE_SHEET_ID_KEY}"]</code> — the only
          localStorage key this app uses.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="timezone">
          Timezone
        </label>
        <select
          id="timezone"
          value={settings.timezone}
          disabled={savingTz}
          onChange={(e) => {
            void handleTimezoneChange(e.target.value);
          }}
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
          {!COMMON_TIMEZONES.includes(settings.timezone) ? (
            <option value={settings.timezone}>{settings.timezone}</option>
          ) : null}
        </select>
        <p className="text-xs text-muted">
          Determines what counts as &ldquo;today&rdquo; for default day selection. Stored in
          the <code>_Settings</code> tab of the sheet so it syncs across devices.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Time display</label>
        <div className="inline-flex rounded-md border border-border overflow-hidden" role="group">
          {(['24h', '12h'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => void setDisplayMode(mode)}
              className={`px-4 py-2 text-sm ${
                settings.displayMode === mode
                  ? 'bg-primary text-primary-fg'
                  : 'bg-surface-2 text-fg hover:bg-border'
              }`}
              aria-pressed={settings.displayMode === mode}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
