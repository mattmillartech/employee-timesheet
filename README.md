# Employee Timesheet

Self-hosted employee hours tracking — a React + TypeScript webapp backed by a
single Google Sheet, with a tiny Express sidecar so AI agents can read / write
hours programmatically. Deployed via Docker + Nginx behind Portainer on a VPS.

- **Live (target):** `https://<your-deploy-host>` — set via reverse proxy
- **Backend data store:** Google Sheet (one tab per employee + a `_Config` tab
  + a live-formula `Dashboard` tab). No server-side database.
- **Human sign-in:** Google Identity Services token flow, gated by an email
  allowlist baked into the build.
- **Agent API:** Express sidecar on port 3001 (proxied at `/api/*` by Nginx),
  authenticated with a bearer-style `X-Agent-Key` header and a Google service
  account token that refreshes automatically.

---

## Features

- **Entry page** — pick an employee, see the current week as a 7-day strip
  with per-day totals, expand any day into a list of work / break slots with
  keyboard-first 4-digit time entry (`0700` → `07:00` on the 4th keystroke).
  12h / 24h display toggle; storage is always 24h.
- **Dashboard** — default landing page. Filter by scope (all employees or
  one) and range (Week / Month / Year / All Time). The Week view shows the
  earliest start time, latest end time, and total hours for each employee per
  day, not just the daily total. Click a week cell to jump to that day's
  entry screen. Copy-as-TSV puts the current view on your clipboard; Print
  uses a print-optimized stylesheet.
- **Settings** — employee CRUD with drag-to-reorder (keyboard-accessible),
  soft-delete via an Active / Hidden toggle (the employee's tab data stays
  intact), Sheet ID input, **timezone picker** (default
  `America/Toronto`, stored in the `_Settings` tab so it syncs across
  devices), 24h / 12h display mode.
- **Dashboard Google Sheet tab** — the app programmatically writes a
  `Dashboard` tab at the first position of the spreadsheet with live `SUMIFS`
  / `MINIFS` / `MAXIFS` formulas. Edit cell `B5` (the Sunday reference date)
  to see a different week; per-cell output looks like `07:00 → 15:00\n8.0h`.

## Stack

- React 18, TypeScript (strict, `noUncheckedIndexedAccess`), Vite 5,
  Tailwind v4 (CSS-first via `@tailwindcss/vite`), date-fns, dnd-kit,
  lucide-react, recharts, sonner, self-hosted Geist + Geist Mono variable
  fonts via `@fontsource-variable`.
- Sidecar: Express 4 ESM, `google-auth-library`, `googleapis`,
  `async-mutex`, `zod`.
- Container: multi-stage Dockerfile (`node:20-alpine` build →
  `nginx:alpine + nodejs + supervisor + tini`), supervisord runs nginx +
  the sidecar together.

## Project layout

```
src/
├── contexts/           AuthContext (GIS) · SheetContext (employees, settings)
├── hooks/              useSheetData (401-retry wrapper) · useWeekNav
├── lib/                sheetsApi · dashboardAggregator · timeUtils · dateUtils · …
├── components/
│   ├── entry/          TimeInput · SlotRow · DayPanel · WeekStrip
│   ├── dashboard/      DashboardFilters · WeekViewTable · RangeSummaryTable · Export
│   ├── layout/         AppShell · Header
│   └── ui/             EmployeeDropdown · AddEmployeeModal · SettingsPanel
└── pages/              LoginPage · DashboardPage · EntryPage · SettingsPage

sidecar/
├── lib/sheetsClient.js GoogleAuth + googleapis wrapper, dedup-by-key logic
└── server.js           Express app, per-tab async-mutex, zod-validated POST body

Dockerfile · docker-compose.yml · nginx.conf · supervisord.conf · .env.example
docs/DEPLOY.md · docs/api-examples.sh
```

---

## Google Cloud setup

All free at single-user scale — you do **not** need to add a billing card.

1. Create a Google Cloud project, e.g. `your-timesheet-project-id`.
2. Enable the **Google Sheets API** and **Google Drive API**
   (APIs & Services → Library → search → Enable).
3. Create an OAuth 2.0 client:
   - Type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:5173` (dev)
     - `https://timesheet.example.com` (prod)
   - Copy the Client ID — it's `VITE_GOOGLE_CLIENT_ID` in your env.
4. Create a Service Account:
   - IAM & Admin → Service Accounts → Create.
   - Name it `timesheet-agent` (or similar).
   - Create a JSON key, download it.
   - The full JSON becomes `GOOGLE_SERVICE_ACCOUNT_JSON` — paste it
     single-line with `\n` sequences preserved (see `.env.example`).
5. Create the Google Sheet:
   - New Google Sheet. Grab the ID from the URL
     (the opaque token between `/d/` and `/edit`).
   - On the first tab, rename it to `_Config` and add this header row:

     | tabName | displayName | active | color | sortOrder |
     |---------|-------------|--------|-------|-----------|

   - Share the sheet with the service account's `client_email` as **Editor**.

The app creates the `_Settings` tab (timezone + display mode), the
`Dashboard` tab (live formulas), and one tab per employee automatically.

## Environment variables

| Variable | Where | What |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | **Build** (frontend) | OAuth 2.0 Web Client ID |
| `VITE_ALLOWED_GOOGLE_EMAIL` | **Build** (frontend) | Only this email can sign in |
| `VITE_SHEET_ID` | **Build** (frontend) | Default Sheet ID (users can override in Settings) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Runtime** (sidecar) | Full service-account JSON, single-line |
| `AGENT_API_KEY` | **Runtime** (sidecar) | Random 48+ char string for `X-Agent-Key` header |

`VITE_*` values are **compiled into the JS bundle at build time** — they
are not secrets (they end up in the browser anyway). Runtime-only vars
stay inside the sidecar process and are never exposed to the client.

Generate a strong `AGENT_API_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Local development

```bash
# Install dependencies
npm install
cd sidecar && npm install && cd ..

# Copy + fill in env for the sidecar (Vite reads .env for VITE_*)
cp .env.example .env

# Frontend at http://localhost:5173, /api proxied to sidecar on 3001
npm run dev

# In a second terminal, run the sidecar
cd sidecar && node server.js
```

To mirror prod exactly, run the full Docker stack locally:

```bash
# Create a docker-compose.override.yml from the .example to drop the
# external npm_proxy network requirement (local machines won't have it)
cp docker-compose.override.yml.example docker-compose.override.yml

docker compose up --build     # http://localhost:3000
```

Validation:

```bash
npm run typecheck             # tsc --noEmit
npm run lint                  # eslint src
npm run build                 # production bundle
```

## Deploy

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full runbook (DNS →
OAuth origins → Portainer git-based stack → reverse-proxy host →
smoke tests). Brief summary:

1. Add an A record pointing your deployment hostname at your VPS IP (or reuse an existing wildcard record).
2. Add `https://<your-deploy-host>` to the OAuth client's Authorized JavaScript origins.
3. Create a git-based Portainer stack from this repo, with the 5 env vars
   above. The stack joins the `npm_proxy` docker network so NPM can reach
   the container as `timesheet:80`.
4. In Nginx Proxy Manager, add a proxy host for your hostname forwarding to `timesheet:80`, with a Let's Encrypt cert.
5. `curl -I https://<your-deploy-host>/` → 200 HTML.

Pushing to `main` + redeploying the Portainer stack ships a new version.

## AI Agent API

All `/api/*` requests (except `/api/health`) require the
`X-Agent-Key: $AGENT_API_KEY` header. Base URL is your deploy origin
(e.g. `https://timesheet.example.com`).

### `GET /api/employees`

```bash
curl -H "X-Agent-Key: $AGENT_KEY" \
  https://timesheet.example.com/api/employees
```

Returns an array of `{ tabName, displayName, active, color, sortOrder }`,
sorted ascending by `sortOrder`.

### `GET /api/hours/:tabName?weekStart=YYYY-MM-DD`

```bash
curl "https://timesheet.example.com/api/hours/jane-smith?weekStart=2026-04-19" \
  -H "X-Agent-Key: $AGENT_KEY"
```

Returns the array of slots for the 7 days starting on `weekStart` (Sunday).
`weekStart` is validated as a real YYYY-MM-DD date.

### `POST /api/hours/:tabName`

```bash
curl -X POST https://timesheet.example.com/api/hours/jane-smith \
  -H "X-Agent-Key: $AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    {"date":"2026-04-13","slotType":"work","start":"08:00","end":"16:00","hours":8.00,"notes":""},
    {"date":"2026-04-14","slotType":"work","start":"07:30","end":"15:30","hours":8.00,"notes":""}
  ]'
```

Body is a zod-validated array (1–200 slots). Each slot is keyed by
`(date, slotType, start)` — if a matching row exists, it's **updated in
place**; otherwise a new row is appended. Writes on the same tab are
serialized by a per-tab async-mutex so two concurrent agents cannot race
to create duplicate rows.

### `GET /api/weeks/:tabName`

```bash
curl -H "X-Agent-Key: $AGENT_KEY" \
  https://timesheet.example.com/api/weeks/jane-smith
```

Returns the list of Sunday-start dates (descending) that have at least one
slot for this employee. Useful for picking a default week when bulk-loading
a new agent.

### `GET /api/health`

Unprotected. Returns `{ status: "ok", service, version, sheetId (6-char prefix), serviceAccount, ts }`.

### Agent prompt block (drop into your agent's system prompt)

> You have access to an hours tracking API at `https://timesheet.example.com`.
> Include the header `X-Agent-Key: <provided separately>` on every request
> except `/api/health`.
>
> - `GET /api/employees` returns the list of employees.
> - `GET /api/hours/<tabName>?weekStart=<YYYY-MM-DD>` returns the week's slots.
> - `POST /api/hours/<tabName>` accepts a JSON array of slots:
>   `{ date: "YYYY-MM-DD", slotType: "work" | "break", start: "HH:MM" (24h), end: "HH:MM" (24h), hours: number, notes?: string }`
> - `hours` is a decimal number. For work slots it's positive (`8.5` = 8h 30min).
>   For break slots it's **negative** so the total for the day subtracts correctly.
> - Dates are ISO YYYY-MM-DD. Times are HH:MM in 24-hour format.
> - When given a paper timesheet image, first call `/api/employees` to map each
>   person's displayed name to their `tabName`, then batch-POST the day's slots
>   for that employee. Dedup happens server-side by `(date, slotType, start)`.

## Troubleshooting

- **Sign-in popup fails with `redirect_uri_mismatch` or `origin_mismatch`.**
  The JS origin isn't in the OAuth client's allowed list. Double-check
  you used `localhost` (not `127.0.0.1`) for local dev, and that prod
  origin has the `https://` scheme.
- **App says "Unauthorized" after sign-in.** The signed-in email doesn't
  match `VITE_ALLOWED_GOOGLE_EMAIL` (case-insensitive). The token is
  revoked — sign in with the allowlisted account.
- **`403 forbidden` on `/api/*`.** `X-Agent-Key` header value doesn't
  equal `AGENT_API_KEY` env var. Check for trailing newlines / whitespace.
- **Sidecar logs `invalid_grant` or `DECODER routines::unsupported`.**
  `GOOGLE_SERVICE_ACCOUNT_JSON` was pasted with `\n` sequences stripped
  or mangled. Redeploy with single-line JSON where the `\n`s are literal.
- **Sheet says "permission denied".** The service account's `client_email`
  isn't shared as Editor on the Sheet. Add it in Google Sheets → Share.
- **Dashboard tab formulas show `#REF!`.** An employee's tab was renamed
  or deleted outside of the app. Hit Settings → "Initialize / rebuild
  Dashboard tab" to regenerate formulas against the current roster.
- **Token expires every hour and I get 401s.** The frontend intercepts
  every 401 Sheets response, silently refreshes the GIS token, and
  retries — you shouldn't see this surface as a user-visible error. If
  you do, the `error_callback` from GIS captured something; check the
  browser console.

## License

MIT. See `LICENSE`.
