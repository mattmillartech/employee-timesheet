# Employee Timesheet — Claude Code Build Prompt

## Project Overview

Build a self-hosted employee hours tracking web app. The backend is a Google
Sheet (one tab per employee). The front-end is a React + Vite + TypeScript app,
served by Nginx inside Docker. There is NO server-side backend — all data access
happens client-side via the Google Sheets API v4 REST endpoints using a bearer
token obtained through Google OAuth 2.0 (GIS implicit/token flow). A Service
Account with its credentials stored as a Docker environment variable provides a
second access path for programmatic/AI agent use.

The project description and use cases need to be respected, but anything to do with the tech stack, coding, etc. are to be taken as suggestions, and could be improved or completely refactored if a more optimal solution presents itself.

---

## Tech Stack (Suggested)

- React 18 + TypeScript + Vite
- Tailwind CSS v4
- Recharts (aggregated view charts)
- Google Identity Services (GIS) SDK — browser OAuth token flow
- Google Sheets API v4 (REST, called directly from the browser with bearer token)
- Service Account (for AI agent / programmatic access — credentials injected via
  Docker env var, token exchange done via a minimal Express sidecar)
- Docker (multi-stage build: node:20-alpine build stage → nginx:alpine serve stage)
- docker-compose.yml for deployment
- If you have a better idea and want to change the tech stack, you are encouraged to do so

---

## Google Cloud Setup (document in README) (UNLESS YOU CAN FIGURE OUT HOW TO DO THIS USING COMPLETELY FREE SERVICES INSTEAD)

1. Create a new Google Cloud project (e.g., "millar-hours-tracker")
2. Enable: Google Sheets API, Google Drive API
3. Create OAuth 2.0 credentials:
   - Type: Web application
   - Authorized JavaScript origins: add your deployment domain
     (e.g., https://timesheet.example.com) AND http://localhost:5173 for dev
   - No redirect URIs needed (implicit/token flow)
4. Create a Service Account:
   - Name: e.g., "ai-agent-access"
   - Download the JSON key file
   - Store contents as environment variable GOOGLE_SERVICE_ACCOUNT_JSON in
     your .env / Docker secrets (never commit this file)
5. Share the Google Sheet with the service account's email address (Editor role)

---

## Google Sheet Structure

### `_Config` tab (row 1 = headers)

| tabName     | displayName  | active | color | sortOrder |
|-------------|--------------|--------|-------|-----------|
| jane-smith  | Jane Smith   | TRUE   |       | 1         |
| john-doe    | John Doe     | FALSE  |       | 2         |

### Per-employee tab (e.g., "jane-smith") (row 1 = headers)

| date       | day | slotType | start | end   | hours | notes |
|------------|-----|----------|-------|-------|-------|-------|
| 2026-04-13 | Sun | work     | 08:00 | 12:00 | 4.00  |       |
| 2026-04-13 | Sun | break    | 12:00 | 12:30 | -0.50 |       |
| 2026-04-14 | Mon | work     | 07:00 | 15:00 | 8.00  |       |

- slotType is either "work" or "break"
- hours for break rows is stored as a negative number
- date is ISO format YYYY-MM-DD
- start and end are 24h HH:MM strings

---

## Authentication Architecture

### Human Login (OAuth 2.0 GIS Token Flow)

- Use the Google Identity Services JS library (accounts.google.com/gsi/client)
- Call google.accounts.oauth2.initTokenClient() with scope:
  https://www.googleapis.com/auth/spreadsheets
- On success, store the access token in React context (in-memory only —
  NO localStorage, NO sessionStorage)
- All Sheets API calls use this token as Authorization: Bearer <token>
- Token expires in ~1 hour; detect 401 responses and re-trigger token flow
- Gate the entire app behind this login — if no token, show only the sign-in screen
- After sign-in, verify the user's email matches VITE_ALLOWED_GOOGLE_EMAIL env var.
  If it does not match, show an "Unauthorized" screen and revoke the token.

### AI Agent / Programmatic Access (Service Account + Express Sidecar)

Run a minimal Express sidecar in the same Docker container on port 3001.
The sidecar is only accessible internally (NOT exposed in docker-compose port
mappings). Nginx proxies /api/* to 127.0.0.1:3001.

The sidecar holds GOOGLE_SERVICE_ACCOUNT_JSON and generates short-lived Google
access tokens using the google-auth-library npm package.

All sidecar endpoints require header: X-Agent-Key matching env var AGENT_API_KEY

Endpoints:

  GET /api/employees
  Returns array of { tabName, displayName, active } from _Config tab

  GET /api/hours/:tabName?weekStart=YYYY-MM-DD
  Returns all slots for that employee for the 7 days starting weekStart (Sunday)

  POST /api/hours/:tabName
  Body: array of slot objects { date, slotType, start, end, hours, notes }
  Appends rows to the employee sheet tab with deduplication:
  if a row for that date+slotType+start already exists, update it; otherwise append

  GET /api/weeks/:tabName
  Returns list of all week-start dates (Sundays) that have any data for that employee

Use supervisord inside the Docker image to manage both nginx and the node sidecar.

---

## Project File Structure

src/
├── main.tsx
├── App.tsx                     # Router, auth context, theme provider
├── contexts/
│   ├── AuthContext.tsx          # Google token, user email, sign-in/out
│   └── SheetContext.tsx         # Sheet ID, employees list, CRUD operations
├── hooks/
│   ├── useSheetData.ts          # Fetch/write via Sheets API
│   ├── useWeekNav.ts            # Week navigation, date helpers
│   └── useTimeInput.ts          # 4-digit time input formatting logic
├── pages/
│   ├── LoginPage.tsx
│   ├── EntryPage.tsx            # Main data entry view
│   ├── PayrollPage.tsx          # Aggregated weekly payroll view
│   └── SettingsPage.tsx         # Employee management, sheet config
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx         # Header + main content area
│   │   └── Header.tsx           # Employee dropdown, week range, total hours
│   ├── entry/
│   │   ├── WeekStrip.tsx        # 7-day row with daily totals
│   │   ├── DayPanel.tsx         # Expanded day with slot rows
│   │   ├── SlotRow.tsx          # Single work/break time slot row
│   │   └── TimeInput.tsx        # 4-digit keyboard input component
│   ├── payroll/
│   │   ├── PayrollTable.tsx     # Employee x day grid with totals
│   │   └── WeekPicker.tsx       # Week navigation for payroll view
│   └── ui/
│       ├── EmployeeDropdown.tsx
│       ├── AddEmployeeModal.tsx
│       └── SettingsPanel.tsx
└── lib/
    ├── sheetsApi.ts             # All Google Sheets API calls
    ├── dateUtils.ts             # Week boundaries, ISO formatting
    ├── timeUtils.ts             # Parse/format HH:MM, calculate hours
    └── constants.ts             # CONFIG_TAB_NAME, SCOPES, etc.

sidecar/
├── server.js                   # Express sidecar for AI agent access
└── package.json

---

## Entry Page — UI Layout & Behavior

### Header (sticky, full width)

  [ Jane Smith ▾ ]   Apr 13 – Apr 19, 2026   38.5 hrs   [ Payroll ] [ 12h/24h ] [ ☀/🌙 ] [ ⚙ ]

- Employee dropdown lists all active employees from _Config in sortOrder,
  plus a divider, then "+ Add Employee" and "Manage Employees" options
- Week range and total auto-update as data loads
- 12h/24h toggle in header — display mode only, storage is always 24h (default: 24h)
- Keyboard shortcut Ctrl+E focuses the employee dropdown

### Week Strip (below header, full width)

Seven day cells, Sun through Sat. Each cell shows:
- Day abbreviation + date number (e.g., "Mon 14")
- Hour total in green if entries exist (e.g., "8.0h"), or "—" in muted color if empty

Selected day is highlighted with the primary accent background.
Click a cell or use left/right arrow keys to change the selected day.

### Day Panel (main area, below week strip)

Example layout:

  Monday, April 14, 2026
  ──────────────────────────────────────────
    Work   [ 07:00 ] → [ 15:00 ]   8.00h  [✕]
    Break  [ 12:00 ] → [ 12:30 ]  -0.50h  [✕]
  ──────────────────────────────────────────
                              Day total: 7.50h
  [ + Add work slot ]   [ + Add break ]

- Slots are saved to the sheet immediately on blur of the End time field
- Deleting a slot (✕ button) removes that row from the sheet immediately
- Day total and week strip cell update in real time as times are entered

### TimeInput Component Behavior

- Displays as HH:MM
- User types 4 digits (e.g., 0700): auto-formats to 07:00 on the 4th digit
- In 12h display mode: stored internally as 24h; displayed with AM/PM suffix
- Tab moves focus from Start field → End field in the same slot
- Enter in the End field: saves the slot, then advances focus to the Start field
  of the next empty slot. If no empty slot exists on this day, advance to the
  first empty day. If all days are complete, open a new slot on the current day.
- Ctrl+Enter: add a new work slot to the current day without advancing
- Ctrl+B: add a new break slot to the current day
- After Saturday's last Enter: advance to next active employee (in _Config
  sortOrder), focus their Sunday Start field
- Esc: cancel current field edit, revert to last saved value

### Smart Default Day Selection

When an employee is selected:
1. Determine the current week (Sun–Sat week containing today)
2. Find the first day in that week with no entries
3. If all days have entries, select Sunday
4. If the employee has no data at all, select Sunday of the current week

---

## Payroll Page — UI Layout

### Week Picker

  ← Prev    Week of Apr 13 – Apr 19, 2026    Next →

### Payroll Table

  Employee         Sun   Mon   Tue   Wed   Thu   Fri   Sat   TOTAL
  ─────────────────────────────────────────────────────────────────
  Jane Smith       4.5   8.0    —    7.5   8.0   6.0    —    34.0
  John Doe          —    7.0   7.5   8.0   8.0    —    4.0   34.5
  ─────────────────────────────────────────────────────────────────
  TOTAL            4.5  15.0   7.5  15.5  16.0   6.0   4.0   68.5

- Hours to 1 decimal, font-variant-numeric: tabular-nums
- Empty days show "—" in muted color
- Rows for each active employee in _Config sortOrder
- Click any cell to jump to that employee + day in the Entry page
- "Copy for Payroll" button: copies table as tab-separated text
- "Print" button: triggers browser print with a print-optimized stylesheet

---

## Settings Page

- List all employees (active + hidden) with toggle active/hidden per row
- Drag-to-reorder rows (writes sortOrder back to _Config tab)
- Add Employee: modal asks for Display Name; auto-generates tabName as
  lowercase-hyphenated slug; creates new sheet tab with correct column headers;
  appends row to _Config
- Sheet ID field: allows updating the Google Sheet ID. Store in localStorage
  under key "hoursTrackerSheetId" — this is the only value allowed in
  localStorage (it is not auth-sensitive)
- Remove Employee: soft-delete only (sets active=FALSE in _Config). Data
  in the employee's tab is never deleted.

---

## Data Layer — sheetsApi.ts

All functions accept token: string (OAuth bearer token or service-account token).
Use fetch() directly against the Google Sheets API v4 REST endpoints:
  https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}

Functions to implement:

  readTab(sheetId, tabName, token): Promise<string[][]>
  appendRows(sheetId, tabName, rows, token): Promise<void>
  updateRow(sheetId, tabName, rowIndex, row, token): Promise<void>
  deleteRow(sheetId, tabName, rowIndex, token): Promise<void>
    (clear the row content; do not delete the row itself to avoid index drift)
  getEmployees(sheetId, token): Promise<Employee[]>
  createEmployeeTab(sheetId, tabName, displayName, token): Promise<void>
  updateEmployee(sheetId, employee, token): Promise<void>
  updateConfigOrder(sheetId, employees, token): Promise<void>

---

## Docker Setup

### Dockerfile (multi-stage)

Stage 1 (build): node:20-alpine
  - WORKDIR /app
  - COPY package*.json and install with npm ci
  - COPY source and run npm run build

Stage 2 (serve): nginx:alpine
  - Install Node.js, npm, and supervisord (via apk)
  - Copy dist/ from build stage to /usr/share/nginx/html
  - Copy custom nginx.conf (SPA fallback: try_files $uri /index.html;
    proxy_pass http://127.0.0.1:3001 for location /api/)
  - Copy sidecar/ directory and run npm ci inside it
  - Copy supervisord.conf that starts both nginx and node sidecar/server.js
  - EXPOSE 80
  - CMD ["supervisord", "-c", "/etc/supervisord.conf"]

### docker-compose.yml

services:
  hours-tracker:
    build: .
    ports:
      - "3000:80"
    environment:
      - VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
      - VITE_ALLOWED_GOOGLE_EMAIL=${VITE_ALLOWED_GOOGLE_EMAIL}
      - VITE_SHEET_ID=${VITE_SHEET_ID}
      - GOOGLE_SERVICE_ACCOUNT_JSON=${GOOGLE_SERVICE_ACCOUNT_JSON}
      - AGENT_API_KEY=${AGENT_API_KEY}
    restart: unless-stopped

### .env.example

VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_ALLOWED_GOOGLE_EMAIL=you@gmail.com
VITE_SHEET_ID=your-google-sheet-id-from-the-url
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
AGENT_API_KEY=generate-a-long-random-secret-string-here

Note: VITE_ prefix is required by Vite to expose vars to the browser bundle.
GOOGLE_SERVICE_ACCOUNT_JSON must NOT have the VITE_ prefix — it is only
accessible to the sidecar, never the browser.

---

## Express Sidecar — sidecar/server.js

Dependencies: express, google-auth-library, googleapis

- On startup, parse GOOGLE_SERVICE_ACCOUNT_JSON env var
- Cache the generated Google access token; refresh it 5 minutes before expiry
- Auth middleware: reject requests where X-Agent-Key !== AGENT_API_KEY env var
- Implement the four endpoints listed in the Authentication Architecture section
- Return clear error responses:
    400 for malformed input
    403 for wrong API key
    404 for unknown employee tabName
    500 for Google Sheets API failures (include the upstream error message)

---

## README Contents

1. Prerequisites and Google Cloud setup (step-by-step)
2. Creating the Google Sheet (exact structure, sharing with service account)
3. Environment variables reference table
4. Local development: npm run dev
5. Docker build and run: docker compose up --build
6. Reverse proxy setup:
   a. Nginx Proxy Manager on Redpill.online VPS
   b. Unraid with Community Apps / Nginx Proxy Manager
7. AI Agent API reference with curl examples:

   List employees:
     curl https://timesheet.example.com/api/employees \
       -H "X-Agent-Key: your-key"

   Get a week of hours:
     curl "https://timesheet.example.com/api/hours/jane-smith?weekStart=2026-04-13" \
       -H "X-Agent-Key: your-key"

   Enter hours (POST):
     curl -X POST https://timesheet.example.com/api/hours/jane-smith \
       -H "X-Agent-Key: your-key" \
       -H "Content-Type: application/json" \
       -d '[
         {"date":"2026-04-13","slotType":"work","start":"08:00","end":"16:00","hours":8.00,"notes":""},
         {"date":"2026-04-14","slotType":"work","start":"07:30","end":"15:30","hours":8.00,"notes":""}
       ]'

   AI agent instructions (include this as a copyable block in the README):
     You have access to an hours tracking API. Base URL: https://timesheet.example.com
     API key: (provided separately as X-Agent-Key header).
     When given an image of a paper timesheet, parse each employee name and their
     daily start/end times, then POST to /api/hours/:tabName for each employee.
     Use GET /api/employees first to map employee names to tabNames.
     Dates are YYYY-MM-DD. Times are HH:MM in 24h format. slotType is "work" or "break".
     Calculate hours as a decimal (e.g., 8h30m = 8.50). Break hours must be negative.

8. Troubleshooting (OAuth origin errors, CORS issues, token expiry, sheet permission errors)

---

## Design Direction

- Style: clean functional dashboard, data-entry optimized, not decorative
- Color palette: Nexus design system (warm beige light surfaces, dark mode supported)
  CSS variables: --color-bg, --color-surface, --color-primary (teal), etc.
  Full Nexus palette token list: see design system notes below
- Fonts: Geist Sans for UI, Geist Mono for time inputs and hour totals only
  Load from: https://fonts.googleapis.com/css2?family=Geist:wght@300..700
             https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400..600
- Light and dark mode: prefers-color-scheme default, manual toggle in header
- Mobile-responsive: week strip scrolls horizontally on small screens,
  day panel is full width, header stacks vertically below 480px
- Keyboard-first: every single action must be reachable without a mouse
- Icons: Lucide React throughout — no emoji in UI
- Loading states: skeleton loaders while Sheets API calls are in flight
- Optimistic UI: update local state immediately on entry, sync to sheet in
  background, show a subtle inline error indicator with retry if write fails
- Toasts: use only for background events (save failures, token expiry warning)
  Success feedback is inline (e.g., day cell turns green in the week strip)

---

## Quality Requirements

- TypeScript strict mode enabled, zero use of `any`
- All Sheets API calls have try/catch with user-facing error messages
- Token expiry: detect 401 from Sheets API, silently re-trigger GIS token flow,
  retry the failed request — user should not lose any entered data
- All time arithmetic uses 24h internally; the 12h/24h toggle is purely display
- Weeks always start on Sunday (verify with date.getDay() === 0)
- Accessibility: WCAG AA contrast, full keyboard navigation, all inputs have
  associated labels, focus management after slot save moves to next logical field,
  skip-to-content link as first focusable element
- No hardcoded Sheet IDs, client IDs, or credentials anywhere in source code
