import express from 'express';
import { Mutex } from 'async-mutex';
import { z } from 'zod';
import {
  getServiceAccountEmail,
  listEmployees,
  listWeekStarts,
  readSlotsInWeek,
  upsertSlots,
} from './lib/sheetsClient.js';

const app = express();
const PORT = Number(process.env.SIDECAR_PORT ?? 3001);
const SHEET_ID = process.env.VITE_SHEET_ID ?? '';
const AGENT_KEY = process.env.AGENT_API_KEY ?? '';

if (!SHEET_ID) {
  console.warn('[sidecar] VITE_SHEET_ID is not set — /api/* calls will fail until configured');
}
if (!AGENT_KEY) {
  console.warn('[sidecar] AGENT_API_KEY is not set — /api/* requests will be rejected');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// =====================
// Request logging (safe — no bodies, no query)
// =====================
app.use((req, _res, next) => {
  console.log(`[sidecar] ${req.method} ${req.path}`);
  next();
});

// =====================
// Health — no auth required (used by nginx + compose healthcheck)
// =====================
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'employee-timesheet-sidecar',
    version: '0.1.0',
    sheetId: SHEET_ID ? `${SHEET_ID.slice(0, 6)}…` : null,
    serviceAccount: getServiceAccountEmail(),
    ts: new Date().toISOString(),
  });
});

// =====================
// Auth middleware for /api/* (except /api/health)
// =====================
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (!AGENT_KEY) {
    return res
      .status(500)
      .json({ error: 'server_misconfigured', message: 'AGENT_API_KEY not set' });
  }
  const provided = req.header('x-agent-key');
  if (provided !== AGENT_KEY) {
    return res.status(403).json({ error: 'forbidden', message: 'Missing or invalid X-Agent-Key' });
  }
  return next();
});

// =====================
// Per-tab mutex map so concurrent POSTs on the same tab serialize.
// Prevents duplicate-append races when two agents hit /api/hours/:tab
// with the same (date,slotType,start) at the same moment.
// =====================
const tabMutexes = new Map();
function mutexFor(tabName) {
  let m = tabMutexes.get(tabName);
  if (!m) {
    m = new Mutex();
    tabMutexes.set(tabName, m);
  }
  return m;
}

// =====================
// Input schemas
// =====================
const SlotInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  slotType: z.enum(['work', 'break']),
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'start must be HH:MM (24h)'),
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'end must be HH:MM (24h)'),
  hours: z.number().finite(),
  notes: z.string().optional().default(''),
  day: z.string().optional(),
});
const SlotsArray = z.array(SlotInput).min(1).max(200);

// =====================
// Endpoints
// =====================

// GET /api/employees
app.get('/api/employees', async (_req, res) => {
  try {
    if (!SHEET_ID) return res.status(500).json({ error: 'no_sheet_id' });
    const employees = await listEmployees(SHEET_ID);
    res.json(employees);
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/hours/:tabName?weekStart=YYYY-MM-DD
app.get('/api/hours/:tabName', async (req, res) => {
  try {
    if (!SHEET_ID) return res.status(500).json({ error: 'no_sheet_id' });
    const tabName = req.params.tabName;
    const weekStart = String(req.query.weekStart ?? '');
    if (!weekStart) {
      return res
        .status(400)
        .json({ error: 'missing_weekStart', message: 'weekStart=YYYY-MM-DD is required' });
    }
    const slots = await readSlotsInWeek(SHEET_ID, tabName, weekStart);
    res.json(slots);
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/weeks/:tabName
app.get('/api/weeks/:tabName', async (req, res) => {
  try {
    if (!SHEET_ID) return res.status(500).json({ error: 'no_sheet_id' });
    const weeks = await listWeekStarts(SHEET_ID, req.params.tabName);
    res.json(weeks);
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/hours/:tabName
app.post('/api/hours/:tabName', async (req, res) => {
  const tabName = req.params.tabName;
  try {
    if (!SHEET_ID) return res.status(500).json({ error: 'no_sheet_id' });
    const parsed = SlotsArray.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const result = await mutexFor(tabName).runExclusive(() =>
      upsertSlots(SHEET_ID, tabName, parsed.data),
    );
    res.json({ ok: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

function sendError(res, err) {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const code = err?.code ?? err?.name ?? 'error';
  const upstream = err?.response?.data?.error?.message ?? null;
  console.error('[sidecar] error:', err?.message ?? err, upstream ?? '');
  res.status(status).json({
    error: code,
    message: err?.message ?? 'internal error',
    ...(upstream ? { upstream } : {}),
  });
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[sidecar] listening on 127.0.0.1:${PORT}`);
});
