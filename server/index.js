import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readRoster, validateRoster, writeRoster } from './store.js';
import { loadPffData, loadPlayerReports, syncPff } from './pff.js';
import { loadCareers, readCareer, syncCareers } from './career.js';
import { loadContracts } from './contracts.js';

try { process.loadEnvFile(path.join(ROOT, '.env')); } catch {}

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/roster', async (_req, res, next) => {
  try {
    const roster = await readRoster();
    res.json({ roster, pff: await loadPffData(roster), contracts: await loadContracts() });
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

app.get('/api/players/:id/reports', async (req, res, next) => {
  try {
    const result = await loadPlayerReports(await readRoster(), req.params.id);
    if (!result) return res.status(404).json({ error: `No player "${req.params.id}"` });
    res.json(result);
  } catch (e) { next(e); }
});

app.get('/api/players/:id/career', async (req, res, next) => {
  try {
    const roster = await readRoster();
    if (!roster.players.some((p) => p.id === req.params.id)) return res.status(404).json({ error: `No player "${req.params.id}"` });
    if (req.query.refresh || !(await readCareer(req.params.id))) {
      const r = await syncCareers(roster, { ids: [req.params.id], force: !!req.query.refresh });
      if (r.failed.length) return res.status(502).json({ error: r.failed.join('; ') });
    }
    res.json(await readCareer(req.params.id));
  } catch (e) { next(e); }
});

app.get('/api/careers', async (_req, res, next) => {
  try { res.json(await loadCareers(await readRoster())); } catch (e) { next(e); }
});

let careerSync = null;
app.post('/api/careers/sync', async (req, res, next) => {
  try {
    const roster = await readRoster();
    careerSync ??= syncCareers(roster, { ids: req.body?.ids, force: !!req.body?.force }).finally(() => { careerSync = null; });
    const result = await careerSync;
    res.json({ ...result, careers: await loadCareers(roster) });
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
