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
  DEFAULT_TIMEZONE,
  ENV,
  LOCALSTORAGE_SHEET_ID_KEY,
  SETTING_KEYS,
} from '@/lib/constants';
import {
  ensureSettingsTab,
  getEmployees,
  writeAppSetting,
} from '@/lib/sheetsApi';
import type { AppSettings, DisplayMode, Employee } from '@/types';

type Status = 'idle' | 'loading' | 'ready' | 'error';

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
};

const SheetContext = createContext<SheetContextValue | null>(null);

function loadInitialSheetId(): string {
  try {
    const fromLs = localStorage.getItem(LOCALSTORAGE_SHEET_ID_KEY);
    if (fromLs && fromLs.length > 0) return fromLs;
  } catch {
    // localStorage access can fail in private-browsing modes; ignore.
  }
  return ENV.sheetIdFromEnv;
}

export function SheetProvider({ children }: { children: ReactNode }): JSX.Element {
  const { status: authStatus } = useAuth();
  const run = useSheetRunner();

  const [sheetId, setSheetIdState] = useState<string>(loadInitialSheetId);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    timezone: DEFAULT_TIMEZONE,
    displayMode: DEFAULT_DISPLAY_MODE,
  });

  const setSheetId = useCallback((id: string) => {
    setSheetIdState(id);
    try {
      localStorage.setItem(LOCALSTORAGE_SHEET_ID_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const refreshEmployees = useCallback(async (): Promise<void> => {
    if (!sheetId) return;
    const list = await run((t) => getEmployees(sheetId, t));
    setEmployees(list);
  }, [run, sheetId]);

  const loadAll = useCallback(async (): Promise<void> => {
    if (!sheetId) {
      setStatus('error');
      setError('No Google Sheet ID configured. Set it in Settings or VITE_SHEET_ID.');
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

  useEffect(() => {
    if (authStatus === 'signed-in') {
      void loadAll();
    } else {
      setStatus('idle');
      setEmployees([]);
    }
  }, [authStatus, loadAll]);

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
    ],
  );

  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>;
}

export function useSheet(): SheetContextValue {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useSheet must be used inside <SheetProvider>');
  return ctx;
}
