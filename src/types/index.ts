export type SlotType = 'work' | 'break';

export type Employee = {
  tabName: string;
  displayName: string;
  active: boolean;
  color: string;
  sortOrder: number;
};

export type Slot = {
  /** Client-generated UUID; not persisted in the sheet. */
  slotId: string;
  /** 1-based sheet row index (row 1 is the header); undefined if not yet saved. */
  rowIndex: number | undefined;
  /** ISO date — YYYY-MM-DD. */
  date: string;
  /** Day abbreviation — Sun, Mon, ...; derived from date but also written to the sheet. */
  day: string;
  slotType: SlotType;
  /** HH:MM (24h, internal). */
  start: string;
  /** HH:MM (24h, internal). */
  end: string;
  /** Decimal hours; negative for break. */
  hours: number;
  notes: string;
};

export type DisplayMode = '12h' | '24h';

export type RangeKind = 'week' | 'month' | 'year' | 'all';

export type DashboardScope =
  | { kind: 'all' }
  | { kind: 'employee'; tabName: string };

export type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

/** Raw row shape coming back from Sheets values.get. */
export type RawRow = readonly string[];

export type AppSettings = {
  /** IANA timezone, e.g. "America/Toronto". Used to determine "today" for default day selection. */
  timezone: string;
  /** Display mode for time cells — stored 24h regardless. */
  displayMode: DisplayMode;
};
