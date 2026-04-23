export const CONFIG_TAB_NAME = '_Config';
export const SETTINGS_TAB_NAME = '_Settings';
export const DASHBOARD_TAB_NAME = 'Dashboard';
export const ALL_SLOTS_TAB_NAME = '_AllSlots';

export const SETTINGS_COLUMNS = ['key', 'value'] as const;
export const SETTINGS_RANGE = 'A:B';

export const SETTING_KEYS = {
  TIMEZONE: 'timezone',
  DISPLAY_MODE: 'displayMode',
} as const;

export const DEFAULT_TIMEZONE = 'America/Toronto';
export const DEFAULT_DISPLAY_MODE = '24h' as const;

export const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
export const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const USERINFO_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
/**
 * drive.file = per-file access to files the app itself created (or that the
 * user explicitly opened via the Picker). This is what lets us find the same
 * user's sheet across devices without a broader "read all your Drive" prompt.
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const SCOPES = [SHEETS_SCOPE, USERINFO_SCOPE, DRIVE_FILE_SCOPE].join(' ');

/** Columns on every employee tab, in order. Row 1 is the header row. */
export const EMPLOYEE_COLUMNS = ['date', 'day', 'slotType', 'start', 'end', 'hours', 'notes'] as const;
export const EMPLOYEE_RANGE = 'A:G';

/** Columns on the `_Config` tab, in order. Row 1 is the header row. */
export const CONFIG_COLUMNS = ['tabName', 'displayName', 'active', 'color', 'sortOrder'] as const;
export const CONFIG_RANGE = 'A:E';

/** Legacy single-sheet key. Retained so pre-multi-user deployments keep working. */
export const LOCALSTORAGE_SHEET_ID_KEY = 'hoursTrackerSheetId';
/** Per-user key prefix: localStorage["hoursTrackerSheetId:<email>"] = sheetId. */
export const LOCALSTORAGE_SHEET_ID_PREFIX = 'hoursTrackerSheetId:';
export const LOCALSTORAGE_AUTH_SESSION_KEY = 'timesheetAuthSession';
export const DEFAULT_NEW_SHEET_TITLE = 'Employee Timesheet';

export const TOKEN_EXPIRY_BUFFER_MS = 60_000;

export const DAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function parseAllowedEmails(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export const ENV = {
  googleClientId: import.meta.env['VITE_GOOGLE_CLIENT_ID'] ?? '',
  /**
   * Comma-separated list of email addresses allowed to sign in.
   * - Empty / unset: any Google account that passes GCP OAuth (gated by
   *   the consent screen's test-user list while unpublished) can sign in
   *   and gets its OWN auto-provisioned sheet.
   * - Non-empty: strict allowlist — sign-in is rejected for any email
   *   that isn't on the list.
   */
  allowedGoogleEmails: parseAllowedEmails(
    import.meta.env['VITE_ALLOWED_GOOGLE_EMAIL'] ?? '',
  ),
  sheetIdFromEnv: import.meta.env['VITE_SHEET_ID'] ?? '',
} as const;
