// Stateless sidecar — no service account, no shared API key. Every /api/*
// request must carry `Authorization: Bearer <google oauth access token>` and
// the sheet to operate on comes from `?sheetId=` (or the `:tabName` path
// param for the per-tab endpoints). The sidecar is a thin proxy that adds:
//   - per-(sheetId, tabName) async-mutex so concurrent POSTs dedup-upsert
//     without racing
//   - zod-validated request body shape
//   - normalized error responses
//
// This makes the container itself carry zero maintainer-specific state —
// forkers can run the same image against any Google account; anyone cloning
// the repo cannot touch any specific account.

import express from 'express';
import { Mutex } from 'async-mutex';
import { z } from 'zod';
import {
  listEmployees,
  listWeekStarts,
  readSlotsInWeek,
  upsertSlots,
} from './lib/sheetsClient.js';

const app = express();
const PORT = Number(process.env.SIDECAR_PORT ?? 3001);

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// Minimal request log — method + path only, never bodies.
app.use((req, _res, next) => {
  console.log(`[sidecar] ${req.method} ${req.path}`);
  next();
});

// Health — no auth required.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'employee-timesheet-sidecar',
    version: '0.2.0',
    auth: 'oauth-bearer',
    ts: new Date().toISOString(),
  });
});

// OAuth bearer middleware for all /api/* except /health.
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  const auth = req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) {
    return res.status(401).json({
      error: 'missing_bearer_token',
      message:
        'Pass a Google OAuth access token as `Authorization: Bearer <token>`. The token determines which Google account the sidecar acts as.',
    });
  }
  req.accessToken = match[1].trim();
  next();
});

// Per-(sheetId, tabName) mutex map — prevents duplicate-append races when two
// callers POST to the same sheet+tab with the same slot key at the same time.
const mutexes = new Map();
function mutexFor(key) {
  let m = mutexes.get(key);
  if (!m) {
    m = new Mutex();
    mutexes.set(key, m);
  }
  return m;
}

function requireSheetId(req, res) {
  const sheetId = String(req.query.sheetId ?? '').trim();
  if (!sheetId) {
    res.status(400).json({
      error: 'missing_sheet_id',
      message: 'Query parameter `sheetId` is required.',
    });
    return null;
  }
  return sheetId;
}

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

// GET /api/employees?sheetId=...
app.get('/api/employees', async (req, res) => {
  const sheetId = requireSheetId(req, res);
  if (!sheetId) return;
  try {
    res.json(await listEmployees(sheetId, req.accessToken));
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/hours/:tabName?sheetId=...&weekStart=YYYY-MM-DD
app.get('/api/hours/:tabName', async (req, res) => {
  const sheetId = requireSheetId(req, res);
  if (!sheetId) return;
  const weekStart = String(req.query.weekStart ?? '');
  if (!weekStart) {
    return res
      .status(400)
      .json({ error: 'missing_weekStart', message: 'weekStart=YYYY-MM-DD is required' });
  }
  try {
    const slots = await readSlotsInWeek(
      sheetId,
      req.params.tabName,
      weekStart,
      req.accessToken,
    );
    res.json(slots);
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/weeks/:tabName?sheetId=...
app.get('/api/weeks/:tabName', async (req, res) => {
  const sheetId = requireSheetId(req, res);
  if (!sheetId) return;
  try {
    res.json(await listWeekStarts(sheetId, req.params.tabName, req.accessToken));
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/hours/:tabName?sheetId=...
app.post('/api/hours/:tabName', async (req, res) => {
  const sheetId = requireSheetId(req, res);
  if (!sheetId) return;
  const { tabName } = req.params;
  try {
    const parsed = SlotsArray.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const result = await mutexFor(`${sheetId}:${tabName}`).runExclusive(() =>
      upsertSlots(sheetId, tabName, parsed.data, req.accessToken),
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
  const upstream = err?.upstream?.error?.message ?? null;
  console.error('[sidecar] error:', err?.message ?? err, upstream ?? '');
  res.status(status).json({
    error: code,
    message: err?.message ?? 'internal error',
    ...(upstream ? { upstream } : {}),
  });
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[sidecar] listening on 127.0.0.1:${PORT} — OAuth bearer auth`);
});
