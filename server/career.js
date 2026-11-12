// Career history (NFL + college) per player from PFF's player reports, using
// their `career=true` form: one row per season. Cached per player on disk.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pffGet, readCache } from './pff.js';
import { CACHE_DIR } from './store.js';

const CAREER_DIR = path.join(CACHE_DIR, 'career');
const STALE_MS = 24 * 60 * 60 * 1000;
const VERSION = 2; // v2: NFL regular/postseason and preseason fetched separately

// PFF week ids. Unfiltered career rows mix preseason in, so NFL history is
// fetched twice: regular + postseason, and preseason on its own.
const NFL_REG_WEEKS = [...Array.from({ length: 18 }, (_, i) => i + 1), 28, 29, 30, 32].join(',');
const NFL_PRE_WEEKS = '-1,-2,-3,-4,-5';
const PHASES = [
  { league: 'nfl', phase: 'reg', week: NFL_REG_WEEKS },
  { league: 'nfl', phase: 'pre', week: NFL_PRE_WEEKS },
  { league: 'ncaa', phase: 'reg', week: null }, // college has no preseason
];

// What each position is graded on. `primary` gives the season grade and the
// snaps it is weighted by; `detail` adds position stats for the career table.
const sum = (...keys) => (r) => keys.reduce((t, k) => t + (r[k] ?? 0), 0);
const UNITS = {
  offense: { primary: 'offense/summary', grade: 'grades_offense', snaps: (r) => r.snap_counts_total, label: 'Offense grade' },
  defense: { primary: 'defense/summary', grade: 'grades_defense', snaps: (r) => r.snap_counts_defense, label: 'Defense grade' },
  kicker: { primary: 'field_goal/summary', grade: 'grades_fgep_kicker', snaps: sum('total_attempts', 'pat_attempts'), label: 'FG/XP grade', detail: ['special/summary'] },
  punter: { primary: 'punting/summary', grade: 'grades_punter', snaps: (r) => r.snaps ?? r.attempts, label: 'Punting grade' },
  longsnap: { primary: 'special/summary', grade: 'grades_long_snap', snaps: sum('snap_counts_field_goal', 'snap_counts_punt_coverage'), label: 'Long-snap grade' },
};
const DETAIL_BY_POSITION = {
  QB: ['passing/summary'], RB: ['rushing/summary'], HB: ['rushing/summary'], FB: ['rushing/summary'],
  WR: ['receiving/summary'], TE: ['receiving/summary'],
  OT: ['offense/pass_blocking'], OG: ['offense/pass_blocking'], C: ['offense/pass_blocking'], T: ['offense/pass_blocking'], G: ['offense/pass_blocking'],
};

export function unitFor(position) {
  if (position === 'K') return 'kicker';
  if (position === 'P') return 'punter';
  if (position === 'LS') return 'longsnap';
  if (['QB', 'RB', 'HB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'T', 'G'].includes(position)) return 'offense';
  return 'defense';
}

const teamNames = {};
async function teamName(league, id) {
  if (!teamNames[league]) {
    const file = path.join(CACHE_DIR, `teams-${league}.json`);
    let teams;
    try { teams = JSON.parse(await readFile(file, 'utf8')); } catch {
      // The college list is slow (~30s) but only fetched once.
      teams = ((await pffGet('/v1/teams', { league })).teams ?? []).map((t) => ({
        id: t.franchise_id, abbr: t.abbreviation, city: t.city, nickname: t.nickname,
      }));
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, JSON.stringify(teams));
    }
    teamNames[league] = new Map(teams.map((t) => [t.id, t]));
  }
  const t = teamNames[league].get(id);
  if (!t) return String(id);
  if (/SENIO|SHRIN/.test(t.abbr ?? '')) return null; // all-star games
  return league === 'nfl' ? t.abbr : t.city ?? t.abbr;
}

async function fetchReport(report, league, pffId, week) {
  const data = await pffGet(`/v1/player/${report}`, { league, player_id: pffId, career: 'true', week }, 3);
  const body = Object.values(data)[0] ?? {};
  return body.seasons ?? [];
}

export async function fetchCareer(player, pffId, pffPosition) {
  const unitKey = unitFor(player.position);
  const unit = UNITS[unitKey];
  const detailReports = unit.detail ?? DETAIL_BY_POSITION[player.position] ?? DETAIL_BY_POSITION[pffPosition] ?? [];
  const seasons = [];
  for (const { league, phase, week } of PHASES) {
    const primary = await fetchReport(unit.primary, league, pffId, week);
    if (!primary.length) continue;
    const details = {};
    for (const r of detailReports) {
      details[r] = new Map((await fetchReport(r, league, pffId, week)).map((row) => [row.season, row]));
    }
    for (const row of primary) {
      const snaps = unit.snaps(row) ?? 0;
      let grade = row[unit.grade] ?? null;
      if (unitKey === 'longsnap' && grade === 0) grade = null; // PFF reports ungraded snappers as 0
      const teams = (await Promise.all((row.franchise_id ?? []).map((id) => teamName(league, id)))).filter(Boolean);
      const stats = { ...row };
      for (const [r, byYear] of Object.entries(details)) Object.assign(stats, byYear.get(row.season) ?? {});
      delete stats.franchise_id; delete stats.season_id;
      seasons.push({ league, phase, season: row.season, teams, snaps, grade, stats });
    }
  }
  const order = (s) => (s.league === 'nfl' ? (s.phase === 'reg' ? 0 : 1) : 2);
  seasons.sort((a, b) => b.season - a.season || order(a) - order(b));
  return { version: VERSION, pffId, unit: unitKey, gradeLabel: unit.label, fetchedAt: new Date().toISOString(), seasons };
}

const careerFile = (id) => path.join(CAREER_DIR, `${id}.json`);

export async function readCareer(id) {
  try { return JSON.parse(await readFile(careerFile(id), 'utf8')); } catch { return null; }
}

// The slim form the whole-team grade toggle needs.
export function compactCareer(c) {
  return c && {
    unit: c.unit, gradeLabel: c.gradeLabel, fetchedAt: c.fetchedAt,
    seasons: c.seasons.map(({ league, phase, season, teams, snaps, grade }) => ({ league, phase, season, teams, snaps, grade })),
  };
}

export async function loadCareers(roster) {
  const out = {};
  await Promise.all(roster.players.map(async (p) => {
    const c = await readCareer(p.id);
    if (c) out[p.id] = compactCareer(c);
  }));
  return out;
}

// Fetch careers for the given players (default: missing or older than a day).
export async function syncCareers(roster, { ids, force = false, log = () => {} } = {}) {
  await mkdir(CAREER_DIR, { recursive: true });
  const directory = (await readCache('players')) ?? {};
  const wanted = roster.players.filter((p) => !ids || ids.includes(p.id));
  const todo = [];
  for (const p of wanted) {
    const existing = force ? null : await readCareer(p.id);
    const pos = p.position;
    const stale = !existing || existing.version !== VERSION || Date.now() - Date.parse(existing.fetchedAt) > STALE_MS || existing.unit !== unitFor(pos);
    if (stale) todo.push(p);
  }
  const failed = [];
  let fetched = 0;
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < todo.length) {
      const p = todo[next++];
      const rec = directory[p.id];
      const pffId = p.pffId ?? rec?.id;
      if (!pffId) { failed.push(`${p.name}: no PFF match`); continue; }
      try {
        const career = await fetchCareer(p, pffId, rec?.position);
        await writeFile(careerFile(p.id), JSON.stringify(career));
        fetched++;
        log(`Career ${fetched}/${todo.length}: ${p.name} (${career.seasons.length} seasons)`);
      } catch (e) {
        failed.push(`${p.name}: ${e.message}`);
      }
    }
  }));
  return { requested: wanted.length, fetched, upToDate: wanted.length - todo.length, failed };
}
