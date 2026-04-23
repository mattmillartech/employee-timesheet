import {
  ALL_SLOTS_TAB_NAME,
  CONFIG_RANGE,
  CONFIG_TAB_NAME,
  DASHBOARD_TAB_NAME,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_TIMEZONE,
  EMPLOYEE_COLUMNS,
  EMPLOYEE_RANGE,
  SETTING_KEYS,
  SETTINGS_RANGE,
  SETTINGS_TAB_NAME,
  SHEETS_API_BASE,
  USERINFO_ENDPOINT,
} from './constants';
import type { AppSettings, DisplayMode, Employee, GoogleUserInfo, RawRow, Slot, SlotType } from '@/types';
import { dayAbbrev, parseISODate, toISODate } from './dateUtils';
import { calculateHours, isValidHHMM } from './timeUtils';

export class SheetsApiError extends Error {
  public readonly status: number;
  public readonly upstream: unknown;
  public constructor(status: number, message: string, upstream?: unknown) {
    super(message);
    this.name = 'SheetsApiError';
    this.status = status;
    this.upstream = upstream;
  }
}

/**
 * Lightweight fetch wrapper used by every Sheets call.
 * The 401-retry behavior is layered in AuthContext via `useSheetData` — this
 * function is the one-shot "do the call, throw on failure" primitive.
 */
async function sheetsFetch<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const bodyText = await response.text();
  let parsed: unknown = null;
  if (bodyText) {
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = bodyText;
    }
  }
  if (!response.ok) {
    const message = extractGoogleErrorMessage(parsed) ?? `Sheets API ${response.status}`;
    throw new SheetsApiError(response.status, message, parsed);
  }
  return parsed as T;
}

function extractGoogleErrorMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const err = (body as { error?: { message?: string } }).error;
  return err?.message ?? null;
}

function encodeRange(tab: string, range: string): string {
  return encodeURIComponent(`${tab}!${range}`);
}

// ============================================================
// Public API — matches the spec's 8 functions + helpers.
// ============================================================

export async function fetchUserInfo(token: string): Promise<GoogleUserInfo> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new SheetsApiError(response.status, 'Failed to fetch user info');
  }
  return (await response.json()) as GoogleUserInfo;
}

export async function readTab(
  sheetId: string,
  tabName: string,
  token: string,
  range?: string,
): Promise<RawRow[]> {
  const url = `${SHEETS_API_BASE}/${sheetId}/values/${encodeRange(tabName, range ?? 'A:Z')}`;
  const data = await sheetsFetch<{ values?: RawRow[] }>(url, token);
  return data.values ?? [];
}

export async function appendRows(
  sheetId: string,
  tabName: string,
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
  token: string,
  range?: string,
): Promise<void> {
  const url =
    `${SHEETS_API_BASE}/${sheetId}/values/${encodeRange(tabName, range ?? EMPLOYEE_RANGE)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await sheetsFetch(url, token, {
    method: 'POST',
    body: JSON.stringify({ values: rows }),
  });
}

export async function updateRow(
  sheetId: string,
  tabName: string,
  rowIndex: number,
  row: ReadonlyArray<string | number>,
  token: string,
  range?: string,
): Promise<void> {
  const cols = range ?? `A${rowIndex}:Z${rowIndex}`;
  const url =
    `${SHEETS_API_BASE}/${sheetId}/values/${encodeRange(tabName, cols)}` +
    `?valueInputOption=USER_ENTERED`;
  await sheetsFetch(url, token, {
    method: 'PUT',
    body: JSON.stringify({ values: [row] }),
  });
}

export async function deleteRow(
  sheetId: string,
  tabName: string,
  rowIndex: number,
  token: string,
  rangeSpec = 'A:G',
): Promise<void> {
  const [startCol, endCol] = rangeSpec.split(':') as [string, string];
  const url =
    `${SHEETS_API_BASE}/${sheetId}/values/` +
    encodeRange(tabName, `${startCol}${rowIndex}:${endCol}${rowIndex}`) +
    ':clear';
  await sheetsFetch(url, token, { method: 'POST', body: JSON.stringify({}) });
}

export type BatchUpdateEntry = {
  range: string;
  values: ReadonlyArray<ReadonlyArray<string | number>>;
};

export async function batchUpdateValues(
  sheetId: string,
  entries: readonly BatchUpdateEntry[],
  token: string,
): Promise<void> {
  if (entries.length === 0) return;
  const url = `${SHEETS_API_BASE}/${sheetId}/values:batchUpdate`;
  await sheetsFetch(url, token, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: entries.map((e) => ({ range: e.range, values: e.values })),
    }),
  });
}

// ============================================================
// Config tab (employee registry)
// ============================================================

export async function getEmployees(sheetId: string, token: string): Promise<Employee[]> {
  const values = await readTab(sheetId, CONFIG_TAB_NAME, token, CONFIG_RANGE);
  if (values.length <= 1) return [];
  const rows = values.slice(1);
  return rows
    .map((row, i) => rowToEmployee(row, i + 2))
    .filter((e): e is Employee => e !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function rowToEmployee(row: RawRow, _rowIndex: number): Employee | null {
  const [tabName, displayName, activeStr, color, sortOrderStr] = row;
  if (!tabName || !displayName) return null;
  return {
    tabName,
    displayName,
    active: String(activeStr ?? '').toUpperCase() === 'TRUE',
    color: color ?? '',
    sortOrder: Number.parseInt(String(sortOrderStr ?? '0'), 10) || 0,
  };
}

/**
 * Creates a new employee tab with headers and appends a row in `_Config`.
 * Does NOT trigger the Dashboard rebuild — caller is responsible for that
 * (SettingsPage does it after any employee mutation).
 */
export async function createEmployeeTab(
  sheetId: string,
  tabName: string,
  displayName: string,
  token: string,
  nextSortOrder: number,
): Promise<void> {
  // 1. Add the tab via batchUpdate
  const addUrl = `${SHEETS_API_BASE}/${sheetId}:batchUpdate`;
  await sheetsFetch(addUrl, token, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
              gridProperties: { rowCount: 1000, columnCount: EMPLOYEE_COLUMNS.length },
            },
          },
        },
      ],
    }),
  });

  // 2. Write the header row on the new tab
  await updateRow(
    sheetId,
    tabName,
    1,
    [...EMPLOYEE_COLUMNS],
    token,
    `A1:G1`,
  );

  // 3. Append the employee to `_Config`
  await appendRows(
    sheetId,
    CONFIG_TAB_NAME,
    [[tabName, displayName, 'TRUE', '', String(nextSortOrder)]],
    token,
    CONFIG_RANGE,
  );
}

export async function updateEmployee(
  sheetId: string,
  employee: Employee,
  token: string,
): Promise<void> {
  const rows = await readTab(sheetId, CONFIG_TAB_NAME, token, CONFIG_RANGE);
  let rowIndex: number | null = null;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row && row[0] === employee.tabName) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex === null) {
    throw new SheetsApiError(404, `Employee not found in _Config: ${employee.tabName}`);
  }
  await updateRow(
    sheetId,
    CONFIG_TAB_NAME,
    rowIndex,
    [
      employee.tabName,
      employee.displayName,
      employee.active ? 'TRUE' : 'FALSE',
      employee.color,
      String(employee.sortOrder),
    ],
    token,
    `A${rowIndex}:E${rowIndex}`,
  );
}

/** Rewrite the sortOrder column for all employees based on their index in the passed list. */
export async function updateConfigOrder(
  sheetId: string,
  orderedTabNames: readonly string[],
  token: string,
): Promise<void> {
  // Re-read to get rowIndexes, since createEmployeeTab/appends may have shifted them.
  const values = await readTab(sheetId, CONFIG_TAB_NAME, token, CONFIG_RANGE);
  const entries: BatchUpdateEntry[] = [];
  const nameToDesiredOrder = new Map<string, number>();
  orderedTabNames.forEach((name, i) => nameToDesiredOrder.set(name, i + 1));

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row) continue;
    const rowIndex = i + 1;
    const tabName = row[0];
    if (!tabName) continue;
    const desired = nameToDesiredOrder.get(tabName);
    if (desired === undefined) continue;
    entries.push({
      range: `${CONFIG_TAB_NAME}!E${rowIndex}:E${rowIndex}`,
      values: [[String(desired)]],
    });
  }
  await batchUpdateValues(sheetId, entries, token);
}

// ============================================================
// Employee tab (slots for one employee)
// ============================================================

export async function readEmployeeSlots(
  sheetId: string,
  tabName: string,
  token: string,
): Promise<Slot[]> {
  const values = await readTab(sheetId, tabName, token, EMPLOYEE_RANGE);
  if (values.length <= 1) return [];
  const slots: Slot[] = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row) continue;
    const rowIndex = i + 1;
    const parsed = rowToSlot(row, rowIndex);
    if (parsed) slots.push(parsed);
  }
  return slots;
}

function rowToSlot(row: RawRow, rowIndex: number): Slot | null {
  const [date, day, slotTypeRaw, start, end, hoursRaw, notes] = row;
  if (!date) return null;
  if (!parseISODate(date)) return null;
  const slotType: SlotType = slotTypeRaw === 'break' ? 'break' : 'work';
  const startStr = start ?? '';
  const endStr = end ?? '';
  const storedHours = Number.parseFloat(String(hoursRaw ?? '0'));
  const hours =
    Number.isFinite(storedHours) && storedHours !== 0
      ? storedHours
      : isValidHHMM(startStr) && isValidHHMM(endStr)
        ? calculateHours(startStr, endStr, slotType)
        : 0;
  return {
    slotId: `${date}|${slotType}|${startStr}|${rowIndex}`,
    rowIndex,
    date,
    day: day ?? dayAbbrev(parseISODate(date) ?? new Date()),
    slotType,
    start: startStr,
    end: endStr,
    hours,
    notes: notes ?? '',
  };
}

export function slotToRow(slot: Slot): ReadonlyArray<string | number> {
  return [
    slot.date,
    slot.day,
    slot.slotType,
    slot.start,
    slot.end,
    slot.hours,
    slot.notes,
  ];
}

/** Convenience: re-derive `day` from the date and return a row ready to write. */
export function slotToRowDerived(slot: Omit<Slot, 'slotId' | 'rowIndex' | 'day'>): ReadonlyArray<string | number> {
  const d = parseISODate(slot.date);
  const day = d ? dayAbbrev(d) : '';
  return [slot.date, day, slot.slotType, slot.start, slot.end, slot.hours, slot.notes];
}

// ============================================================
// App settings (`_Settings` tab — key / value)
// ============================================================

const DEFAULT_SETTINGS: AppSettings = {
  timezone: DEFAULT_TIMEZONE,
  displayMode: DEFAULT_DISPLAY_MODE,
};

export async function readAppSettings(
  sheetId: string,
  token: string,
): Promise<AppSettings> {
  let rows: RawRow[];
  try {
    rows = await readTab(sheetId, SETTINGS_TAB_NAME, token, SETTINGS_RANGE);
  } catch (err) {
    if (err instanceof SheetsApiError && err.status === 400) {
      // Tab doesn't exist yet — return defaults; caller may call ensureSettingsTab.
      return { ...DEFAULT_SETTINGS };
    }
    throw err;
  }
  const result = { ...DEFAULT_SETTINGS };
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const key = row[0];
    const value = row[1] ?? '';
    if (key === SETTING_KEYS.TIMEZONE && value) {
      result.timezone = value;
    } else if (key === SETTING_KEYS.DISPLAY_MODE && (value === '12h' || value === '24h')) {
      result.displayMode = value as DisplayMode;
    }
  }
  return result;
}

/**
 * Idempotent: creates the `_Settings` tab if absent, writes headers + default
 * rows for any missing keys. Returns the resulting settings.
 */
export async function ensureSettingsTab(
  sheetId: string,
  token: string,
): Promise<AppSettings> {
  // Fast path — does the tab exist?
  let existingRows: RawRow[] | null = null;
  try {
    existingRows = await readTab(sheetId, SETTINGS_TAB_NAME, token, SETTINGS_RANGE);
  } catch (err) {
    if (!(err instanceof SheetsApiError && err.status === 400)) throw err;
  }

  if (existingRows === null) {
    // Create the tab.
    const addUrl = `${SHEETS_API_BASE}/${sheetId}:batchUpdate`;
    await sheetsFetch(addUrl, token, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: SETTINGS_TAB_NAME,
                hidden: false,
                gridProperties: { rowCount: 50, columnCount: 2 },
              },
            },
          },
        ],
      }),
    });
    // Write header + default rows.
    await updateRow(sheetId, SETTINGS_TAB_NAME, 1, ['key', 'value'], token, 'A1:B1');
    await appendRows(
      sheetId,
      SETTINGS_TAB_NAME,
      [
        [SETTING_KEYS.TIMEZONE, DEFAULT_SETTINGS.timezone],
        [SETTING_KEYS.DISPLAY_MODE, DEFAULT_SETTINGS.displayMode],
      ],
      token,
      SETTINGS_RANGE,
    );
    return { ...DEFAULT_SETTINGS };
  }

  // Tab exists — merge missing keys.
  const existing = new Map<string, string>();
  for (let i = 1; i < existingRows.length; i++) {
    const row = existingRows[i];
    if (!row) continue;
    const k = row[0];
    if (k) existing.set(k, row[1] ?? '');
  }
  const toAppend: Array<readonly [string, string]> = [];
  if (!existing.has(SETTING_KEYS.TIMEZONE)) {
    toAppend.push([SETTING_KEYS.TIMEZONE, DEFAULT_SETTINGS.timezone]);
  }
  if (!existing.has(SETTING_KEYS.DISPLAY_MODE)) {
    toAppend.push([SETTING_KEYS.DISPLAY_MODE, DEFAULT_SETTINGS.displayMode]);
  }
  if (toAppend.length > 0) {
    await appendRows(sheetId, SETTINGS_TAB_NAME, toAppend, token, SETTINGS_RANGE);
  }
  return {
    timezone: existing.get(SETTING_KEYS.TIMEZONE) || DEFAULT_SETTINGS.timezone,
    displayMode: ((): DisplayMode => {
      const v = existing.get(SETTING_KEYS.DISPLAY_MODE);
      return v === '12h' || v === '24h' ? v : DEFAULT_DISPLAY_MODE;
    })(),
  };
}

/**
 * Update a single setting key. If the key doesn't exist yet, appends it.
 * Caller is responsible for calling `ensureSettingsTab` once before first use
 * so the sheet exists.
 */
export async function writeAppSetting(
  sheetId: string,
  key: string,
  value: string,
  token: string,
): Promise<void> {
  const rows = await readTab(sheetId, SETTINGS_TAB_NAME, token, SETTINGS_RANGE);
  let rowIndex: number | null = null;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row && row[0] === key) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex !== null) {
    await updateRow(
      sheetId,
      SETTINGS_TAB_NAME,
      rowIndex,
      [key, value],
      token,
      `A${rowIndex}:B${rowIndex}`,
    );
  } else {
    await appendRows(sheetId, SETTINGS_TAB_NAME, [[key, value]], token, SETTINGS_RANGE);
  }
}

// ============================================================
// Dashboard sheet tab — live-formula current-week view
// ============================================================

type SpreadsheetProperties = {
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
      index?: number;
    };
  }>;
};

async function listSheetProperties(
  sheetId: string,
  token: string,
): Promise<SpreadsheetProperties> {
  const url = `${SHEETS_API_BASE}/${sheetId}?fields=sheets(properties(sheetId,title,index))`;
  return sheetsFetch<SpreadsheetProperties>(url, token);
}

/**
 * Idempotent: ensures the `Dashboard` tab sits at index 0 with a native
 * Google Sheets Pivot Table that users can reconfigure live to switch between
 * views (all-employees vs one-employee, daily vs weekly vs monthly vs yearly
 * vs all-time). The pivot sources from a hidden `_AllSlots` tab that
 * consolidates every employee's rows with an Employee column tacked on via
 * a single stacking formula.
 *
 * Call this on first Dashboard-page load or whenever the employee list
 * changes — the stacking formula references each active employee's tab by
 * name, so it has to be rewritten when the roster changes.
 */
export async function initOrRebuildDashboardTab(
  sheetId: string,
  employees: readonly Employee[],
  token: string,
): Promise<void> {
  const active = employees
    .filter((e) => e.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // --- Phase 1: ensure Dashboard (index 0, visible) and _AllSlots (hidden)
  //              exist and are cleared of any prior content / pivots.
  let props = await listSheetProperties(sheetId, token);
  let dashboardSheetId = props.sheets?.find((s) => s.properties?.title === DASHBOARD_TAB_NAME)?.properties?.sheetId;
  let allSlotsSheetId = props.sheets?.find((s) => s.properties?.title === ALL_SLOTS_TAB_NAME)?.properties?.sheetId;

  const phase1: unknown[] = [];
  if (dashboardSheetId === undefined) {
    phase1.push({
      addSheet: {
        properties: {
          title: DASHBOARD_TAB_NAME,
          index: 0,
          gridProperties: { rowCount: 200, columnCount: 20, frozenRowCount: 6 },
        },
      },
    });
  } else {
    phase1.push({
      updateSheetProperties: {
        properties: { sheetId: dashboardSheetId, index: 0, hidden: false },
        fields: 'index,hidden',
      },
    });
    phase1.push({
      updateCells: {
        range: { sheetId: dashboardSheetId },
        fields: 'userEnteredValue,userEnteredFormat,pivotTable',
      },
    });
  }
  if (allSlotsSheetId === undefined) {
    phase1.push({
      addSheet: {
        properties: {
          title: ALL_SLOTS_TAB_NAME,
          hidden: true,
          gridProperties: { rowCount: 5000, columnCount: 10 },
        },
      },
    });
  } else {
    phase1.push({
      updateSheetProperties: {
        properties: { sheetId: allSlotsSheetId, hidden: true },
        fields: 'hidden',
      },
    });
    phase1.push({
      updateCells: {
        range: { sheetId: allSlotsSheetId },
        fields: 'userEnteredValue,userEnteredFormat',
      },
    });
  }

  if (phase1.length > 0) {
    const res = await sheetsFetch<{
      replies?: Array<{ addSheet?: { properties?: { title?: string; sheetId?: number } } }>;
    }>(`${SHEETS_API_BASE}/${sheetId}:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({ requests: phase1 }),
    });
    for (const r of res.replies ?? []) {
      const p = r.addSheet?.properties;
      if (p?.title === DASHBOARD_TAB_NAME && p.sheetId !== undefined) dashboardSheetId = p.sheetId;
      if (p?.title === ALL_SLOTS_TAB_NAME && p.sheetId !== undefined) allSlotsSheetId = p.sheetId;
    }
  }

  // We need both IDs from here on out.
  if (dashboardSheetId === undefined || allSlotsSheetId === undefined) {
    props = await listSheetProperties(sheetId, token);
    dashboardSheetId = props.sheets?.find((s) => s.properties?.title === DASHBOARD_TAB_NAME)?.properties?.sheetId;
    allSlotsSheetId = props.sheets?.find((s) => s.properties?.title === ALL_SLOTS_TAB_NAME)?.properties?.sheetId;
  }
  if (dashboardSheetId === undefined || allSlotsSheetId === undefined) {
    throw new SheetsApiError(500, 'Failed to resolve Dashboard / _AllSlots sheet IDs');
  }

  // --- Phase 2: write cell values via values.batchUpdate (header rows,
  //              intro copy, stacking formula). Pivot creation happens in
  //              phase 3 via spreadsheets.batchUpdate because it needs the
  //              richer UpdateCellsRequest shape.
  const dashboardHeader: string[][] = [
    ['Employee Timesheet — Dashboard'],
    [],
    ['↓ The pivot table below starts at row 8. To reconfigure it:'],
    [
      '   1. Hover the cursor over the pivot table.',
    ],
    [
      '   2. Click the "Edit" button that appears (top-right of the pivot).',
    ],
    [
      '   3. Use the editor panel to filter by employee, change the Date grouping (Day / Week / Month / Year / Day-of-Week), or add SlotType as a filter.',
    ],
  ];

  const allSlotsRows = buildAllSlotsSheetValues(active);

  await batchUpdateValues(
    sheetId,
    [
      { range: `${DASHBOARD_TAB_NAME}!A1:A6`, values: dashboardHeader },
      { range: `${ALL_SLOTS_TAB_NAME}!A1:H1`, values: [[...ALL_SLOTS_HEADERS]] },
      ...(allSlotsRows
        ? [{ range: `${ALL_SLOTS_TAB_NAME}!A2:A2`, values: [[allSlotsRows]] as string[][] }]
        : []),
    ],
    token,
  );

  // --- Phase 3: drop a pivot table onto Dashboard!A8 sourcing from _AllSlots.
  //              Default view: rows = Employee + Date(grouped by week),
  //              values = SUM(Hours), columns = (none), filters = (none).
  //              User can reconfigure in-place via the pivot editor.
  const pivotRequest = {
    updateCells: {
      rows: [
        {
          values: [
            {
              pivotTable: {
                source: {
                  sheetId: allSlotsSheetId,
                  startRowIndex: 0,
                  startColumnIndex: 0,
                  endColumnIndex: 8,
                },
                rows: [
                  {
                    sourceColumnOffset: 0,
                    showTotals: true,
                    sortOrder: 'ASCENDING',
                    label: 'Employee',
                  },
                  {
                    sourceColumnOffset: 1,
                    showTotals: false,
                    sortOrder: 'ASCENDING',
                    label: 'Date',
                    // Sheets API's PivotTable.DateTimeRuleType enum does NOT
                    // include a week-bucket option — week grouping is a UI-
                    // only feature applied via manual bucket editing. We
                    // default to YEAR_MONTH_DAY (one row per distinct date)
                    // and the user can switch to YEAR_MONTH / YEAR_QUARTER /
                    // YEAR / DAY_OF_WEEK directly from the pivot editor panel
                    // if they want a rolled-up view.
                    groupRule: {
                      dateTimeRule: { type: 'YEAR_MONTH_DAY' },
                    },
                  },
                ],
                values: [
                  {
                    sourceColumnOffset: 6,
                    summarizeFunction: 'SUM',
                    name: 'Hours',
                  },
                ],
                valueLayout: 'HORIZONTAL',
              },
            },
          ],
        },
      ],
      start: { sheetId: dashboardSheetId, rowIndex: 7, columnIndex: 0 },
      fields: 'pivotTable',
    },
  };

  await sheetsFetch(`${SHEETS_API_BASE}/${sheetId}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({ requests: [pivotRequest] }),
  });
}

const ALL_SLOTS_HEADERS = [
  'Employee',
  'Date',
  'Day',
  'SlotType',
  'Start',
  'End',
  'Hours',
  'Notes',
] as const;

/**
 * Build a single monster formula for `_AllSlots!A2` that vertically stacks
 * each active employee's rows with an Employee column prepended, and filters
 * out placeholder rows that come from empty tabs.
 *
 * The QUERY wrapper at the outermost level strips rows where Col1 is blank,
 * which is what the IFERROR fallback per employee produces for an empty tab.
 */
function buildAllSlotsSheetValues(activeEmployees: readonly Employee[]): string | null {
  if (activeEmployees.length === 0) return null;
  const blocks = activeEmployees
    .map((e) => {
      const ref = sheetRef(e.tabName);
      const name = e.tabName.replace(/"/g, '""');
      // Per-employee block: { [EmployeeColumn], [tab A2:G] }.
      // IFERROR to a single-row 8-col placeholder if the tab is empty.
      return (
        `IFERROR(ARRAYFORMULA({IF(${ref}!A2:A<>"", "${name}", ""), ${ref}!A2:G}), ` +
        `{"","","","","","","",""})`
      );
    })
    .join(';');
  return (
    `=IFERROR(QUERY({${blocks}}, "SELECT * WHERE Col1 <> '' AND Col1 IS NOT NULL", 0), ` +
    `{"","","","","","","",""})`
  );
}

function sheetRef(tabName: string): string {
  // Quote the tab name so Sheets accepts hyphens / spaces.
  return `'${tabName.replace(/'/g, "''")}'`;
}

export { toISODate };
