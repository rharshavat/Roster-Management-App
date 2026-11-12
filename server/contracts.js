// Player contracts from nflverse's copy of OverTheCap contract data
// (https://github.com/nflverse/nflverse-data, release tag "contracts").
// Money values are in millions of dollars. Matched to rostered players by
// name, then draft year, college and position when names collide.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readParquet } from 'parquet-wasm';
import { tableFromIPC } from 'apache-arrow';
import { normalizeName, readCache } from './pff.js';
import { CACHE_DIR } from './store.js';

const SOURCE = 'https://github.com/nflverse/nflverse-data/releases/download/contracts/historical_contracts.parquet';
const OUT = path.join(CACHE_DIR, 'contracts.json');

const FAMILY = {
  QB: 'QB', RB: 'RB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE',
  OT: 'OL', T: 'OL', LT: 'OL', RT: 'OL', OG: 'OL', G: 'OL', LG: 'OL', RG: 'OL', C: 'OL', OL: 'OL',
  DE: 'DL', ED: 'DL', EDGE: 'DL', DT: 'DL', DI: 'DL', IDL: 'DL', NT: 'DL', DL: 'DL',
  LB: 'LB', ILB: 'LB', OLB: 'LB', MLB: 'LB',
  CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB', DB: 'DB', SAF: 'DB',
  K: 'K', P: 'P', LS: 'LS',
};
const family = (pos) => FAMILY[(pos ?? '').toUpperCase()] ?? pos;
const plain = (v) => (v && typeof v.toJSON === 'function' ? v.toJSON() : v);
const list = (v) => (v ? v.toArray().map(plain) : []);

export async function syncContracts(roster, { log = console.log } = {}) {
  log('Downloading nflverse contracts (OverTheCap)…');
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Contracts download failed: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const table = tableFromIPC(readParquet(bytes).intoIPCStream());

  const col = (name) => table.getChild(name);
  const [player, active, yearSigned] = ['player', 'is_active', 'year_signed'].map(col);
  const byName = new Map();
  for (let i = 0; i < table.numRows; i++) {
    const key = normalizeName(player.get(i) ?? '');
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(i);
  }

  const directory = (await readCache('players')) ?? {};
  const out = {};
  const unmatched = [];
  for (const p of roster.players) {
    let rows = byName.get(normalizeName(p.name)) ?? [];
    if (!rows.length) {
      // Nicknames (Scotty/Scott, Cam/Cameron): same last name and first
      // initial, same position family.
      const [first, ...rest] = normalizeName(p.name).split(' ');
      const last = rest.join(' ');
      for (const [key, idx] of byName) {
        const [f, ...l] = key.split(' ');
        if (l.join(' ') === last && f[0] === first[0] && (f.startsWith(first) || first.startsWith(f))) {
          rows = rows.concat(idx.filter((i) => family(col('position').get(i)) === family(p.position)));
        }
      }
    }
    if (!rows.length) { unmatched.push(p.name); continue; }
    const bio = directory[p.id];
    // Several people can share a name: score each OTC player by how well
    // their draft year, college and position fit what PFF says.
    const score = (i) => {
      let s = 0;
      const draft = Number(col('draft_year').get(i));
      if (bio?.draft?.season && draft === bio.draft.season) s += 4;
      const college = (col('college').get(i) ?? '').toLowerCase();
      if (bio?.college && college && bio.college.toLowerCase().startsWith(college.split(' ')[0])) s += 2;
      if (family(col('position').get(i)) === family(p.position)) s += 2;
      if (active.get(i)) s += 1;
      return s;
    };
    const best = rows.reduce((a, b) => (score(b) > score(a) ? b : a));
    const otcId = col('otc_id').get(best);
    // That player's contract row: the active one, else the latest signed.
    const theirs = rows.filter((i) => col('otc_id').get(i) === otcId);
    const pick = theirs.find((i) => active.get(i)) ?? theirs.reduce((a, b) => (Number(yearSigned.get(b)) > Number(yearSigned.get(a)) ? b : a));
    const row = plain(table.get(pick));
    const seasons = list(row.season_history);
    out[p.id] = {
      otcId: row.otc_id,
      playerPage: row.player_page,
      position: row.position,
      team: row.team,
      isActive: !!row.is_active,
      current: {
        team: row.team, yearSigned: Number(row.year_signed), years: Number(row.years),
        value: row.value, apy: row.apy, guaranteed: row.guaranteed, apyCapPct: row.apy_cap_pct,
      },
      history: list(row.contract_history),
      seasons: seasons.filter((s) => s.year !== 'Total'),
      totals: seasons.find((s) => s.year === 'Total') ?? null,
    };
  }
  await mkdir(CACHE_DIR, { recursive: true });
  const doc = { fetchedAt: new Date().toISOString(), source: 'nflverse / OverTheCap', players: out };
  await writeFile(OUT, JSON.stringify(doc));
  log(`Contracts matched for ${Object.keys(out).length}/${roster.players.length} players.${unmatched.length ? ` No contract found: ${unmatched.join(', ')}` : ''}`);
  return { matched: Object.keys(out).length, unmatched, fetchedAt: doc.fetchedAt };
}

export async function loadContracts() {
  try { return JSON.parse(await readFile(OUT, 'utf8')); } catch { return null; }
}
