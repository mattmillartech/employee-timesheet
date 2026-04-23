export const CONFIG_TAB_NAME = '_Config';
export const SETTINGS_TAB_NAME = '_Settings';
export const DASHBOARD_TAB_NAME = 'Dashboard';

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
export const SCOPES = [SHEETS_SCOPE, USERINFO_SCOPE].join(' ');

/** Columns on every employee tab, in order. Row 1 is the header row. */
export const EMPLOYEE_COLUMNS = ['date', 'day', 'slotType', 'start', 'end', 'hours', 'notes'] as const;
export const EMPLOYEE_RANGE = 'A:G';

/** Columns on the `_Config` tab, in order. Row 1 is the header row. */
export const CONFIG_COLUMNS = ['tabName', 'displayName', 'active', 'color', 'sortOrder'] as const;
export const CONFIG_RANGE = 'A:E';

export const LOCALSTORAGE_SHEET_ID_KEY = 'hoursTrackerSheetId';

export const TOKEN_EXPIRY_BUFFER_MS = 60_000;

export const DAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const ENV = {
  googleClientId: import.meta.env['VITE_GOOGLE_CLIENT_ID'] ?? '',
  allowedGoogleEmail: (import.meta.env['VITE_ALLOWED_GOOGLE_EMAIL'] ?? '').toLowerCase(),
  sheetIdFromEnv: import.meta.env['VITE_SHEET_ID'] ?? '',
} as const;
