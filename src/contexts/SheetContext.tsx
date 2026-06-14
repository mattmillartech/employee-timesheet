import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
import { listAppTimesheets, readAppPrefs, writeAppPrefs } from '@/lib/driveApi';
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
 * Per-browser fallback chain for the sheet ID, used ONLY when the Drive
 * prefs file (the per-account source of truth) hasn't been created yet.
 * Once the prefs file exists, it overrides everything here.
 */
function resolveLocalFallback(email: string | null): string {
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

  const [sheetId, setSheetIdState] = useState<string>(() => resolveLocalFallback(null));
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    timezone: DEFAULT_TIMEZONE,
    displayMode: DEFAULT_DISPLAY_MODE,
  });
  // Drive prefs file ID — captured on bootstrap so subsequent setSheetId
  // calls PATCH the same file instead of creating a duplicate. Refs are
  // fine here because callers never need to react to the value changing.
  const prefsFileIdRef = useRef<string | null>(null);
  // Tracks the sheetId whose data is currently loaded, so the sheetId-change
  // effect below never redundantly reloads what the bootstrap just loaded.
  const loadedRef = useRef<string | null>(null);

  const setSheetId = useCallback(
    (id: string) => {
      setSheetIdState(id);
      if (email) {
        persistSheetIdForUser(email, id);
      } else {
        lsSet(LOCALSTORAGE_SHEET_ID_KEY, id);
      }
      // Push to Drive prefs in the background so the OTHER browsers signed
      // in to this same Google account converge on this sheet too. Ignore
      // failure — local browser still uses the new id; the next bootstrap
      // on this machine will re-sync from Drive.
      void run((t) => writeAppPrefs(t, { sheetId: id }, prefsFileIdRef.current ?? undefined))
        .then((fileId) => {
          prefsFileIdRef.current = fileId;
        })
        .catch((err) => {
          console.warn('[sheet-context] writeAppPrefs failed; sheet choice will not sync across devices yet', err);
        });
    },
    [email, run],
  );

  const refreshEmployees = useCallback(async (): Promise<void> => {
    if (!sheetId) return;
    const list = await run((t) => getEmployees(sheetId, t));
    setEmployees(list);
  }, [run, sheetId]);

  const loadAllFor = useCallback(async (id: string): Promise<void> => {
    if (!id) {
      setStatus('error');
      setError('No sheet ID configured.');
      return;
    }
    setStatus('loading');
    setError(null);
    // Retry transient failures (cold sidecar, Google token not yet warm on
    // first paint, Sheets API hiccup) before surfacing an error. These
    // transients — not a hard failure — are what made the dashboard load
    // empty / stick on "Waiting on sheet data" until a manual refresh (#1).
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const appSettings = await run((t) => ensureSettingsTab(id, t));
        const list = await run((t) => getEmployees(id, t));
        setSettings(appSettings);
        setEmployees(list);
        loadedRef.current = id;
        setStatus('ready');
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    setStatus('error');
    setError(lastErr instanceof Error ? lastErr.message : String(lastErr));
  }, [run]);

  const loadAll = useCallback((): Promise<void> => loadAllFor(sheetId), [loadAllFor, sheetId]);

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

  // On sign-in, resolve the sheet id for the current account. Drive prefs
  // are authoritative — the same file lives in the user's Drive and is
  // visible to every browser signed in to that account, so two devices on
  // the same Google login can never disagree about which sheet to use.
  //
  // Discovery order:
  //   1. Drive prefs file (per-account, cross-device)              ← truth
  //   2. Local fallback (per-email + legacy localStorage + VITE_SHEET_ID)
  //      — used only on first ever sign-in, then immediately written up
  //      to Drive so step 1 takes over from there on
  //   3. Drive search for any app-created spreadsheet (drive.file scope)
  //   4. Auto-provision a fresh sheet
  // After 2/3/4 we always write the chosen id to Drive prefs so the next
  // sign-in (here or on any other device) hits step 1 directly.
  useEffect(() => {
    if (authStatus !== 'signed-in') {
      setStatus('idle');
      setEmployees([]);
      prefsFileIdRef.current = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      setStatus('loading');
      setError(null);
      try {
        // (1) Drive prefs — authoritative source of truth across devices.
        // Best-effort: if Drive can't be reached (e.g. silent token refresh
        // popup-blocked on bootstrap with no user gesture), fall through
        // to the local fallback chain instead of erroring out the whole
        // bootstrap. The next user-initiated action that needs a token
        // will refresh in response to a real click and Drive prefs will
        // catch up on the next load.
        let prefsResult: Awaited<ReturnType<typeof readAppPrefs>> = null;
        try {
          prefsResult = await run((t) => readAppPrefs(t));
        } catch (err) {
          console.warn('[sheet-context] readAppPrefs failed; using local fallback', err);
        }
        if (cancelled) return;
        if (prefsResult?.prefs.sheetId) {
          prefsFileIdRef.current = prefsResult.fileId;
          setSheetIdState(prefsResult.prefs.sheetId);
          if (email) persistSheetIdForUser(email, prefsResult.prefs.sheetId);
          // Load EXPLICITLY with the resolved id. Relying on the sheetId-change
          // effect breaks when the resolved id equals the initial fallback id
          // (React bails on identical state -> effect never fires -> status
          // stuck on 'loading' = permanent "Waiting on sheet data"). (#1)
          if (!cancelled) await loadAllFor(prefsResult.prefs.sheetId);
          return;
        }
        // No prefs file yet (first ever sign-in for this account, OR an
        // upgrade from the old localStorage-only world). Pick something
        // and persist it to Drive so future loads converge.
        if (prefsResult) {
          // Empty prefs file already exists — keep its id so we PATCH it.
          prefsFileIdRef.current = prefsResult.fileId;
        }

        // (2) Local fallback chain.
        const fallback = resolveLocalFallback(email);
        if (fallback) {
          if (cancelled) return;
          setSheetIdState(fallback);
          if (email) persistSheetIdForUser(email, fallback);
          // Best-effort persist to Drive — don't block the user on this.
          try {
            const fileId = await run((t) =>
              writeAppPrefs(t, { sheetId: fallback }, prefsFileIdRef.current ?? undefined),
            );
            if (!cancelled) prefsFileIdRef.current = fileId;
          } catch (err) {
            console.warn('[sheet-context] initial writeAppPrefs failed', err);
          }
          if (!cancelled) await loadAllFor(fallback);
          return;
        }

        if (!email) return;

        // (3) Drive search for app-created sheets.
        setStatus('provisioning');
        const discovered = await run((t) => listAppTimesheets(t));
        if (cancelled) return;
        if (discovered.length > 0) {
          const chosen = discovered[0];
          if (!chosen) throw new Error('Drive search returned an empty entry');
          setSheetIdState(chosen.id);
          persistSheetIdForUser(email, chosen.id);
          try {
            const fileId = await run((t) =>
              writeAppPrefs(t, { sheetId: chosen.id }, prefsFileIdRef.current ?? undefined),
            );
            if (!cancelled) prefsFileIdRef.current = fileId;
          } catch (err) {
            console.warn('[sheet-context] initial writeAppPrefs failed', err);
          }
          return;
        }

        // (4) Auto-provision a fresh sheet.
        const newId = await provisionNewSheet();
        if (cancelled) return;
        try {
          const fileId = await run((t) =>
            writeAppPrefs(t, { sheetId: newId }, prefsFileIdRef.current ?? undefined),
          );
          if (!cancelled) prefsFileIdRef.current = fileId;
        } catch (err) {
          console.warn('[sheet-context] writeAppPrefs after provision failed', err);
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(
          err instanceof Error
            ? `Couldn't find or create a sheet: ${err.message}`
            : String(err),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, email]);

  // Re-run loadAll whenever sheetId changes while signed in.
  useEffect(() => {
    if (authStatus !== 'signed-in') return;
    if (!sheetId) return;
    // Skip if the bootstrap (or an explicit setSheetId) already loaded this
    // exact sheet — avoids a redundant double-fetch. Still fires when the user
    // switches to a different sheet (loadedRef !== sheetId).
    if (loadedRef.current === sheetId) return;
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
