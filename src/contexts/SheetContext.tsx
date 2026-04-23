import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { useSheetRunner } from '@/hooks/useSheetData';
import {
  DEFAULT_DISPLAY_MODE,
  DEFAULT_NEW_SHEET_TITLE,
  DEFAULT_TIMEZONE,
  ENV,
  LOCALSTORAGE_SHEET_ID_KEY,
  LOCALSTORAGE_SHEET_ID_PREFIX,
  SETTING_KEYS,
} from '@/lib/constants';
import {
  createTimesheetSpreadsheet,
  ensureSettingsTab,
  getEmployees,
  writeAppSetting,
} from '@/lib/sheetsApi';
import { listAppTimesheets } from '@/lib/driveApi';
import type { AppSettings, DisplayMode, Employee } from '@/types';

type Status = 'idle' | 'loading' | 'provisioning' | 'ready' | 'error';

type SheetContextValue = {
  sheetId: string;
  setSheetId: (id: string) => void;
  status: Status;
  error: string | null;
  employees: Employee[];
  activeEmployees: Employee[];
  refreshEmployees: () => Promise<void>;
  settings: AppSettings;
  setTimezone: (tz: string) => Promise<void>;
  setDisplayMode: (mode: DisplayMode) => Promise<void>;
  /** Create a brand-new sheet for the signed-in user (replaces the current one for this user). */
  createNewSheetForUser: () => Promise<string>;
};

const SheetContext = createContext<SheetContextValue | null>(null);

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore — private browsing etc.
  }
}

/**
 * Resolve the sheet ID to use for a given signed-in email.
 * Priority:
 *   1. Per-email localStorage — `hoursTrackerSheetId:<email>`
 *   2. Legacy global localStorage — `hoursTrackerSheetId` (preserves
 *      pre-multi-user deployments where one sheet was shared)
 *   3. Build-time `VITE_SHEET_ID` env var (same migration safety net)
 *   4. null → caller provisions a fresh sheet
 */
function resolveSheetId(email: string | null): string {
  if (email) {
    const perUser = lsGet(`${LOCALSTORAGE_SHEET_ID_PREFIX}${email.toLowerCase()}`);
    if (perUser) return perUser;
  }
  const legacy = lsGet(LOCALSTORAGE_SHEET_ID_KEY);
  if (legacy) return legacy;
  return ENV.sheetIdFromEnv;
}

function persistSheetIdForUser(email: string, sheetId: string): void {
  lsSet(`${LOCALSTORAGE_SHEET_ID_PREFIX}${email.toLowerCase()}`, sheetId);
  // Also keep the legacy global key in sync for backwards-compatibility with
  // anything that still reads it directly.
  lsSet(LOCALSTORAGE_SHEET_ID_KEY, sheetId);
}

export function SheetProvider({ children }: { children: ReactNode }): JSX.Element {
  const { status: authStatus, email } = useAuth();
  const run = useSheetRunner();

  const [sheetId, setSheetIdState] = useState<string>(() => resolveSheetId(null));
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    timezone: DEFAULT_TIMEZONE,
    displayMode: DEFAULT_DISPLAY_MODE,
  });

  const setSheetId = useCallback(
    (id: string) => {
      setSheetIdState(id);
      if (email) {
        persistSheetIdForUser(email, id);
      } else {
        lsSet(LOCALSTORAGE_SHEET_ID_KEY, id);
      }
    },
    [email],
  );

  const refreshEmployees = useCallback(async (): Promise<void> => {
    if (!sheetId) return;
    const list = await run((t) => getEmployees(sheetId, t));
    setEmployees(list);
  }, [run, sheetId]);

  const loadAll = useCallback(async (): Promise<void> => {
    if (!sheetId) {
      setStatus('error');
      setError('No sheet ID configured.');
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const appSettings = await run((t) => ensureSettingsTab(sheetId, t));
      setSettings(appSettings);
      const list = await run((t) => getEmployees(sheetId, t));
      setEmployees(list);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [run, sheetId]);

  const provisionNewSheet = useCallback(async (): Promise<string> => {
    if (!email) throw new Error('No signed-in user — cannot provision a sheet.');
    setStatus('provisioning');
    setError(null);
    const title = `${DEFAULT_NEW_SHEET_TITLE} — ${email}`;
    const newId = await run((t) => createTimesheetSpreadsheet(title, t));
    persistSheetIdForUser(email, newId);
    setSheetIdState(newId);
    return newId;
  }, [email, run]);

  const createNewSheetForUser = useCallback(async (): Promise<string> => {
    const newId = await provisionNewSheet();
    // Immediately trigger loadAll for the new sheet.
    // (loadAll depends on sheetId state — the setSheetIdState above will
    // trigger a re-render whose effect runs loadAll; we return early.)
    return newId;
  }, [provisionNewSheet]);

  // On sign-in, (re)resolve the sheet id for the current user. Discovery
  // order:
  //   1. Per-email localStorage (preserves prior choice on this device)
  //   2. Legacy global localStorage + VITE_SHEET_ID env (backward compat)
  //   3. Drive API `drive.file`-scoped search for app-created sheets
  //      (cross-device — same OAuth client sees the same created-file set)
  //   4. Auto-provision a fresh sheet in the user's Drive
  useEffect(() => {
    if (authStatus !== 'signed-in') {
      setStatus('idle');
      setEmployees([]);
      return;
    }
    const resolved = resolveSheetId(email);
    if (resolved) {
      setSheetIdState(resolved);
      void loadAll();
      return;
    }
    if (!email) return;
    // Try Drive search first — if the user created a sheet via this app on
    // another device, it shows up here and we reuse it.
    void (async () => {
      setStatus('provisioning');
      setError(null);
      try {
        const discovered = await run((t) => listAppTimesheets(t));
        if (discovered.length > 0) {
          // Use the oldest app-created sheet as canonical. Race-safe:
          // two devices signing in concurrently create duplicates; next
          // sign-in picks the oldest (first-written-wins).
          const chosen = discovered[0];
          if (!chosen) throw new Error('Drive search returned an empty entry');
          persistSheetIdForUser(email, chosen.id);
          setSheetIdState(chosen.id);
          return;
        }
        await provisionNewSheet();
      } catch (err) {
        setStatus('error');
        setError(
          err instanceof Error
            ? `Couldn't find or create a sheet: ${err.message}`
            : String(err),
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, email]);

  // Re-run loadAll whenever sheetId changes while signed in.
  useEffect(() => {
    if (authStatus !== 'signed-in') return;
    if (!sheetId) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId, authStatus]);

  const setTimezone = useCallback(
    async (tz: string): Promise<void> => {
      await run((t) => writeAppSetting(sheetId, SETTING_KEYS.TIMEZONE, tz, t));
      setSettings((prev) => ({ ...prev, timezone: tz }));
    },
    [run, sheetId],
  );

  const setDisplayMode = useCallback(
    async (mode: DisplayMode): Promise<void> => {
      await run((t) => writeAppSetting(sheetId, SETTING_KEYS.DISPLAY_MODE, mode, t));
      setSettings((prev) => ({ ...prev, displayMode: mode }));
    },
    [run, sheetId],
  );

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);

  const value = useMemo<SheetContextValue>(
    () => ({
      sheetId,
      setSheetId,
      status,
      error,
      employees,
      activeEmployees,
      refreshEmployees,
      settings,
      setTimezone,
      setDisplayMode,
      createNewSheetForUser,
    }),
    [
      sheetId,
      setSheetId,
      status,
      error,
      employees,
      activeEmployees,
      refreshEmployees,
      settings,
      setTimezone,
      setDisplayMode,
      createNewSheetForUser,
    ],
  );

  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>;
}

export function useSheet(): SheetContextValue {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useSheet must be used inside <SheetProvider>');
  return ctx;
}
