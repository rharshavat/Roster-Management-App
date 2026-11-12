// PFF Pro API client and sync. Pulls Bears data from api.pff.com into
// data/pff-cache/ so the app reads PFF data from disk, not on every request.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { CACHE_DIR, readRoster } from './store.js';

const BASE = 'https://api.pff.com';

// Respect HTTPS_PROXY when set (e.g. the Claude Code cloud environment).
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

function authHeader() {
  if (process.env.PFF_API_KEY) return `Bearer ${process.env.PFF_API_KEY}`;
  // In the cloud environment the proxy replaces this with the saved key.
  if (process.env.HTTPS_PROXY || process.env.https_proxy) return 'Bearer proxy-injected';
  throw new Error('PFF_API_KEY is not set. Copy .env.example to .env and add your PFF Pro API key.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pffGet(pathname, params = {}, attempts = 4) {
  const url = new URL(pathname, BASE);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  let res;
  for (let i = 1; ; i++) {
    res = await fetch(url, { headers: { Authorization: authHeader(), Accept: 'application/json' } });
    // Reports are slow upstream; transient 429/5xx are worth a retry.
    if (![429, 500, 502, 503, 504].includes(res.status) || i >= attempts) break;
    await res.arrayBuffer();
    await sleep(1000 * 2 ** i);
  }
  const body = await res.text();
  if (!res.ok) {
    let msg = body.slice(0, 300);
    try { msg = JSON.parse(body).error?.message ?? msg; } catch {}
    throw new Error(`PFF ${res.status} on ${url.pathname}: ${msg}`);
  }
  return JSON.parse(body);
}

export function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.'’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

// The three summary reports feed each player's headline grade.
const REPORTS = ['offense', 'defense', 'special-teams'];

// Every team report PFF serves, in display order.
export const ALL_REPORTS = {
  offense: 'Offense summary', passing: 'Passing', 'passing-depth': 'Passing by depth',
  'passing-pressure': 'Passing under pressure', rushing: 'Rushing', receiving: 'Receiving',
  'receiving-depth': 'Receiving by depth', blocking: 'Blocking', 'pass-blocking': 'Pass blocking',
  'run-blocking': 'Run blocking', defense: 'Defense summary', 'run-defense': 'Run defense',
  'pass-rush': 'Pass rush', coverage: 'Coverage', 'special-teams': 'Special teams summary',
  'kick-returns': 'Kick & punt returns', 'field-goals': 'Field goals', punting: 'Punting', kickoffs: 'Kickoffs',
};

// Columns that identify the row rather than describe performance.
const IDENTITY_COLUMNS = new Set(['playerId', 'player', 'position', 'team', 'teamName', 'franchiseId', 'jerseyNumber', 'draftSeason', 'eligibleSeason']);

export async function syncPff({ log = console.log } = {}) {
  const roster = await readRoster();
  const { slug, season, abbreviation } = roster.team;
  await mkdir(CACHE_DIR, { recursive: true });
  const save = (name, data) => writeFile(path.join(CACHE_DIR, `${name}.json`), JSON.stringify(data, null, 2));

  log(`Fetching PFF depth chart for ${slug} ${season}…`);
  const depth = await pffGet(`/v2/nfl/teams/${slug}/roster`, { season });
  await save('depth-chart', depth);

  // PFF's reports are slow and sometimes time out upstream. A failed report
  // keeps its last cached copy and is reported as a warning.
  const warnings = [];
  const reports = {};
  await mapLimit(Object.keys(ALL_REPORTS), 3, async (r) => {
    try {
      reports[r] = await pffGet(`/v2/nfl/teams/${slug}/reports/${r}`, { season }, 3);
      await save(`report-${r}`, reports[r]);
      log(`Fetched ${r} report (${reports[r].rows.length} players).`);
    } catch (e) {
      reports[r] = await readCache(`report-${r}`);
      warnings.push(`${ALL_REPORTS[r]} report not updated${reports[r] ? ' (kept previous copy)' : ''}: ${e.message}`);
      log(`Warning: ${warnings.at(-1)}`);
    }
  });

  log('Fetching schedule…');
  try {
    await save('schedule', await pffGet(`/v2/nfl/teams/${slug}/schedule`, { season }, 2));
  } catch (e) {
    warnings.push(`Schedule not updated: ${e.message}`);
    log(`Warning: ${warnings.at(-1)}`);
  }

  // Resolve every managed player to a PFF player record.
  const known = new Map();
  for (const row of depth.rows) known.set(normalizeName(row.name), row.playerId);
  for (const rep of Object.values(reports)) for (const row of rep?.rows ?? []) known.set(normalizeName(row.player), row.playerId);

  log(`Looking up ${roster.players.length} players in the PFF directory…`);
  const directory = {};
  const unmatched = [];
  await mapLimit(roster.players, 6, async (p) => {
    let id = p.pffId ?? known.get(normalizeName(p.name));
    let rec = null;
    if (id) {
      rec = (await pffGet('/v1/players', { league: 'nfl', id })).players?.[0] ?? null;
    } else {
      const found = (await pffGet('/v1/players', { league: 'nfl', name: p.name })).players ?? [];
      const sameName = found.filter((f) => normalizeName(`${f.first_name} ${f.last_name}`) === normalizeName(p.name));
      const pool = sameName.length ? sameName : found;
      rec = pool.find((f) => f.team?.abbreviation === abbreviation) ?? (pool.length === 1 ? pool[0] : null);
      if (!rec) {
        // Nicknames ("Scotty" vs PFF's "Scott"): search the last name, then
        // take a same-team player whose first name shares the first letter.
        const [first, ...rest] = normalizeName(p.name).split(' ');
        const last = rest.join(' ');
        const byLast = (await pffGet('/v1/players', { league: 'nfl', name: last })).players ?? [];
        const cands = byLast.filter((f) => f.team?.abbreviation === abbreviation
          && normalizeName(f.last_name) === last
          && normalizeName(f.first_name)[0] === first[0]);
        if (cands.length === 1) rec = cands[0];
      }
    }
    if (rec) directory[p.id] = rec;
    else unmatched.push(p.name);
  });
  await save('players', directory);

  const meta = { syncedAt: new Date().toISOString(), season, team: slug, matched: Object.keys(directory).length, unmatched, warnings };
  await save('meta', meta);
  log(`Done. Matched ${meta.matched}/${roster.players.length} players.${unmatched.length ? ` Unmatched: ${unmatched.join(', ')}` : ''}`);
  return meta;
}

async function readCache(name) {
  try { return JSON.parse(await readFile(path.join(CACHE_DIR, `${name}.json`), 'utf8')); }
  catch { return null; }
}

const pick = (row, keys) => Object.fromEntries(keys.filter((k) => row[k] != null).map((k) => [k, row[k]]));

// Per-player PFF data keyed by our player id, plus team-level data.
export async function loadPffData(roster) {
  const meta = await readCache('meta');
  if (!meta) return { meta: null, players: {}, schedule: null };
  const [depth, schedule, directory, ...reps] = await Promise.all([
    readCache('depth-chart'), readCache('schedule'), readCache('players'),
    ...REPORTS.map((r) => readCache(`report-${r}`)),
  ]);
  const byPff = (table) => new Map((table?.rows ?? []).map((r) => [r.playerId, r]));
  const depthById = new Map();
  for (const row of depth?.rows ?? []) {
    if (!depthById.has(row.playerId)) depthById.set(row.playerId, { ...row, slots: [] });
    depthById.get(row.playerId).slots.push(`${row.alignment}${row.depthOrder}`);
  }
  const [off, def, st] = reps.map(byPff);

  const players = {};
  for (const p of roster.players) {
    const rec = directory?.[p.id];
    const pffId = p.pffId ?? rec?.id;
    if (!pffId) continue;
    const d = depthById.get(pffId);
    const o = off.get(pffId), df = def.get(pffId), s = st.get(pffId);
    players[p.id] = {
      pffId,
      bio: rec && {
        position: rec.position, jersey: rec.jersey_number, height: rec.height, weight: rec.weight,
        dob: rec.dob, college: rec.college, draft: rec.draft && {
          season: rec.draft.season, round: rec.draft.round, pick: rec.draft.selection, team: rec.draft.team?.abbreviation,
        },
        team: rec.team?.abbreviation ?? null,
      },
      depth: d && {
        slots: d.slots, unit: d.unit, grade: d.grade, gradeRank: d.gradeRank, gradeRankOf: d.gradeRankOf,
        snaps: d.snapCounts, snapPct: d.snapPct, status: d.status,
      },
      offense: o && pick(o, ['gradesOffense', 'gradesPass', 'gradesRun', 'gradesPassRoute', 'gradesPassBlock', 'gradesRunBlock', 'snapCountsTotal', 'snapCountsPassRoute', 'snapCountsPassBlock', 'snapCountsRunBlock', 'playerGameCount']),
      defense: df && pick(df, ['gradesDefense', 'gradesRunDefense', 'gradesPassRushDefense', 'gradesCoverageDefense', 'gradesTackle', 'snapCountsDefense', 'tackles', 'sacks', 'hurries', 'interceptions', 'missedTackles', 'playerGameCount']),
      specialTeams: s && pick(s, ['gradesMiscSt', 'gradesKickReturn', 'gradesPuntReturn', 'gradesPunter', 'gradesFgepKicker', 'gradesKickoffKicker', 'gradesLongSnap', 'totalSnaps', 'tackles']),
    };
  }
  // PFF's own depth chart, each row tagged with our player id when matched.
  const ourIdByPff = new Map(Object.entries(players).map(([id, d]) => [d.pffId, id]));
  const depthChart = (depth?.rows ?? []).map((r) => ({
    pffId: r.playerId, ourId: ourIdByPff.get(r.playerId) ?? null, name: r.name, jersey: r.jersey,
    position: r.position, alignment: r.alignment, depthOrder: r.depthOrder, unit: r.unit,
    grade: r.grade, snaps: r.snapCounts, status: r.status,
  }));
  return { meta, players, depthChart, schedule: schedule?.rows ?? null };
}

// Every cached team report row for one player, with its stat columns.
export async function loadPlayerReports(roster, playerId) {
  const player = roster.players.find((p) => p.id === playerId);
  if (!player) return null;
  const directory = (await readCache('players')) ?? {};
  const pffId = player.pffId ?? directory[playerId]?.id;
  if (!pffId) return { pffId: null, reports: [] };
  const reports = [];
  for (const [key, label] of Object.entries(ALL_REPORTS)) {
    const rep = await readCache(`report-${key}`);
    const row = rep?.rows.find((r) => r.playerId === pffId);
    if (!row) continue;
    const columns = rep.columns.filter((c) => !IDENTITY_COLUMNS.has(c.key) && row[c.key] != null);
    if (!columns.length) continue;
    reports.push({ key, label, weekGroup: rep.weekGroup, columns, values: Object.fromEntries(columns.map((c) => [c.key, row[c.key]])) });
  }
  return { pffId, reports };
}
