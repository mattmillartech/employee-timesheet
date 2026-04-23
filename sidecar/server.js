import express from 'express';

const app = express();
const PORT = Number(process.env.SIDECAR_PORT ?? 3001);

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'employee-timesheet-sidecar',
    version: '0.1.0',
    ts: new Date().toISOString(),
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[sidecar] listening on 127.0.0.1:${PORT}`);
});
