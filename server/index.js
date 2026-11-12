import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readRoster, validateRoster, writeRoster } from './store.js';
import { loadPffData, syncPff } from './pff.js';

try { process.loadEnvFile(path.join(ROOT, '.env')); } catch {}

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/roster', async (_req, res, next) => {
  try {
    const roster = await readRoster();
    res.json({ roster, pff: await loadPffData(roster) });
  } catch (e) { next(e); }
});

app.put('/api/roster', async (req, res, next) => {
  try {
    const errors = validateRoster(req.body);
    if (errors.length) return res.status(400).json({ error: 'Invalid roster', details: errors });
    await writeRoster(req.body);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

let syncing = null;
app.post('/api/pff/sync', async (_req, res, next) => {
  try {
    syncing ??= syncPff().finally(() => { syncing = null; });
    res.json(await syncing);
  } catch (e) { next(e); }
});

const dist = path.join(ROOT, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Roster API on http://localhost:${port}`));
