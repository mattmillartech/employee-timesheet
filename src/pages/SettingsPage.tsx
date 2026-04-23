import { useState } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, ExternalLink, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSheet } from '@/contexts/SheetContext';
import { useSheetRunner } from '@/hooks/useSheetData';
import { AddEmployeeModal } from '@/components/ui/AddEmployeeModal';
import { SettingsPanel } from '@/components/ui/SettingsPanel';
import {
  createEmployeeTab,
  initOrRebuildDashboardTab,
  updateConfigOrder,
  updateEmployee,
} from '@/lib/sheetsApi';
import type { Employee } from '@/types';

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
  const {
    sheetId,
    setSheetId,
    settings,
    setTimezone,
    setDisplayMode,
    employees,
    refreshEmployees,
    createNewSheetForUser,
  } = useSheet();
  const { email } = useAuth();
  const run = useSheetRunner();

  const [sheetIdDraft, setSheetIdDraft] = useState(sheetId);
  const [savingTz, setSavingTz] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);

  const syncDashboardTab = async (activeList: readonly Employee[]): Promise<void> => {
    try {
      await run((t) => initOrRebuildDashboardTab(sheetId, activeList, t));
    } catch (err) {
      toast.warning(
        `Dashboard sync failed (employees saved): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleCreateEmployee = async ({
    displayName,
    tabName,
  }: {
    displayName: string;
    tabName: string;
  }): Promise<void> => {
    const nextSort = employees.length > 0
      ? Math.max(...employees.map((e) => e.sortOrder)) + 1
      : 1;
    await run((t) => createEmployeeTab(sheetId, tabName, displayName, t, nextSort));
    toast.success(`Added ${displayName}`);
    await refreshEmployees();
    await syncDashboardTab([...employees.filter((e) => e.active), {
      tabName,
      displayName,
      active: true,
      color: '',
      sortOrder: nextSort,
    }]);
  };

  const handleReorder = async (orderedTabNames: string[]): Promise<void> => {
    await run((t) => updateConfigOrder(sheetId, orderedTabNames, t));
    await refreshEmployees();
    await syncDashboardTab(
      orderedTabNames
        .map((tab, i) => {
          const found = employees.find((e) => e.tabName === tab);
          if (!found) return null;
          return { ...found, sortOrder: i + 1 };
        })
        .filter((e): e is Employee => e !== null && e.active),
    );
  };

  const handleToggleActive = async (tabName: string, nextActive: boolean): Promise<void> => {
    const target = employees.find((e) => e.tabName === tabName);
    if (!target) return;
    const updated: Employee = { ...target, active: nextActive };
    await run((t) => updateEmployee(sheetId, updated, t));
    toast.success(nextActive ? `${target.displayName} active` : `${target.displayName} hidden`);
    await refreshEmployees();
    await syncDashboardTab(
      employees
        .map((e) => (e.tabName === tabName ? updated : e))
        .filter((e) => e.active),
    );
  };

  const handleTimezoneChange = async (tz: string): Promise<void> => {
    setSavingTz(true);
    try {
      await setTimezone(tz);
      toast.success(`Timezone set to ${tz}`);
    } finally {
      setSavingTz(false);
    }
  };

  const handleInitDashboard = async (): Promise<void> => {
    setDashboardBusy(true);
    try {
      await run((t) => initOrRebuildDashboardTab(sheetId, employees.filter((e) => e.active), t));
      toast.success('Dashboard tab initialized in the Google Sheet.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDashboardBusy(false);
    }
  };

  const handleCreateNewSheet = async (): Promise<void> => {
    if (
      !window.confirm(
        `This will create a brand-new Google Sheet in ${email}'s Drive and switch the app to use it. Your current sheet stays untouched — you can always paste its ID back below to return to it. Continue?`,
      )
    ) return;
    setCreatingSheet(true);
    try {
      const newId = await createNewSheetForUser();
      setSheetIdDraft(newId);
      toast.success('New sheet created and now active.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingSheet(false);
    }
  };

  return (
    <section className="p-6 max-w-3xl space-y-8">
      <header>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-muted text-sm">
          Employees, Google Sheet wiring, and per-app preferences.
        </p>
      </header>

      {/* Employees */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <SettingsPanel
          employees={employees}
          onReorder={handleReorder}
          onToggleActive={handleToggleActive}
          onAddEmployee={() => setAddOpen(true)}
        />
      </div>

      {/* Google Sheet wiring */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <div>
          <h3 className="font-medium">Google Sheet</h3>
          <p className="text-xs text-muted">
            Each signed-in account has its own sheet. Switch sheets by pasting a different ID or create a fresh one.
          </p>
        </div>

        {sheetId ? (
          <div className="text-sm bg-surface-2 rounded-md border border-border p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-muted text-xs">Active sheet</p>
              <p className="font-mono truncate">{sheetId}</p>
            </div>
            <a
              href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline text-sm shrink-0"
            >
              <ExternalLink className="w-4 h-4" aria-hidden />
              Open
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted">No sheet configured yet.</p>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="sheet-id">
            Switch to a different sheet (paste ID)
          </label>
          <div className="flex gap-2">
            <input
              id="sheet-id"
              type="text"
              value={sheetIdDraft}
              onChange={(e) => setSheetIdDraft(e.target.value)}
              className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-sm"
              placeholder="opaque ID from the sheet URL"
            />
            <button
              type="button"
              onClick={() => setSheetId(sheetIdDraft.trim())}
              disabled={!sheetIdDraft.trim() || sheetIdDraft.trim() === sheetId}
              className="rounded-md bg-primary text-primary-fg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Use this sheet
            </button>
          </div>
          <p className="text-xs text-muted">
            The sheet must already be accessible by {email ?? 'the signed-in account'}.
            Stored per-account in localStorage.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleCreateNewSheet()}
            disabled={creatingSheet}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-border disabled:opacity-60"
          >
            <Plus className="w-4 h-4" aria-hidden />
            <span>{creatingSheet ? 'Creating…' : 'Create a new sheet in my Drive'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleInitDashboard()}
            disabled={dashboardBusy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-border disabled:opacity-60"
          >
            <FileSpreadsheet className="w-4 h-4" aria-hidden />
            <span>{dashboardBusy ? 'Building…' : 'Initialize / rebuild Dashboard tab'}</span>
          </button>
        </div>
      </div>

      {/* Preferences */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <h3 className="font-medium">Preferences</h3>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="timezone">
            Timezone
          </label>
          <select
            id="timezone"
            value={settings.timezone}
            disabled={savingTz}
            onChange={(e) => void handleTimezoneChange(e.target.value)}
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
                aria-pressed={settings.displayMode === mode ? 'true' : 'false'}
              >
                {mode}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            Storage is always 24h — this toggle only changes how times render in the UI.
          </p>
        </div>
      </div>

      <AddEmployeeModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={handleCreateEmployee}
        existing={employees}
      />
    </section>
  );
}
