// Data access for the two ways the app runs:
// - server: the Express API in server/ (local dev, Claude Code session)
// - artifact: a published claude.ai page with a built-in PFF snapshot,
//   saving the roster to the artifact's database (doc app/roster).

const snapshotEl = typeof document !== 'undefined' ? document.getElementById('pff-snapshot') : null;
const SNAPSHOT = snapshotEl ? JSON.parse(snapshotEl.textContent) : null;
export const MODE = SNAPSHOT ? 'artifact' : 'server';
export const snapshotInfo = SNAPSHOT && { builtAt: SNAPSHOT.builtAt };

const ROSTER_DOC = 'app/roster';

async function json(res) {
  const data = await res.json();
  if (!res.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join('\n'));
  return data;
}

// ---- artifact database ----
let dbPromise = null;
function getDb() {
  dbPromise ??= (async () => {
    // window.claude can arrive just after the page's script starts.
    for (let i = 0; i < 50 && !window.claude?.use; i++) await new Promise((r) => setTimeout(r, 100));
    if (!window.claude?.use) return null;
    return Promise.race([
      window.claude.use('db'),
      new Promise((r) => setTimeout(() => r(null), 10000)),
    ]);
  })().catch(() => null);
  return dbPromise;
}

// ---- API ----

/** { roster, pff, careers, storage } — storage says where edits are saved. */
export async function loadAll() {
  if (MODE === 'server') {
    const data = await json(await fetch('/api/roster'));
    const c = await fetch('/api/careers');
    return { ...data, careers: c.ok ? await c.json() : {}, storage: 'server' };  // data.contracts from /api/roster
  }
  const careers = Object.fromEntries(Object.entries(SNAPSHOT.careers).map(([id, c]) => [id, compactCareer(c)]));
  const db = await getDb();
  let roster = SNAPSHOT.roster;
  let storage = 'none';
  if (db) {
    try {
      const snap = await db.doc(ROSTER_DOC).get();
      if (snap.exists && snap.data()?.roster) roster = snap.data().roster;
      storage = 'db';
    } catch {
      storage = 'none';
    }
  }
  return { roster, pff: SNAPSHOT.pff, careers, contracts: SNAPSHOT.contracts ?? null, storage };
}

export async function saveRoster(roster) {
  if (MODE === 'server') {
    return json(await fetch('/api/roster', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(roster),
    }));
  }
  const db = await getDb();
  if (!db) throw new Error('Saving is not available in this view. Open the artifact on claude.ai while signed in.');
  try {
    await db.doc(ROSTER_DOC).set({ roster, savedAt: new Date().toISOString() });
  } catch (e) {
    throw new Error(e?.message ?? 'Saving failed.');
  }
  return { ok: true };
}

export const canSync = MODE === 'server';

export async function syncPff() {
  return json(await fetch('/api/pff/sync', { method: 'POST' }));
}

export async function reloadPff() {
  return (await json(await fetch('/api/roster'))).pff;
}

export async function syncCareers(force) {
  return json(await fetch('/api/careers/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
  }));
}

export async function playerReports(id) {
  if (MODE === 'artifact') return SNAPSHOT.reports[id] ?? { pffId: null, reports: [] };
  return json(await fetch(`/api/players/${encodeURIComponent(id)}/reports`));
}

export async function playerCareer(id, refresh = false) {
  if (MODE === 'artifact') {
    const c = SNAPSHOT.careers[id];
    if (!c) throw new Error('No career history in this snapshot for this player.');
    return c;
  }
  return json(await fetch(`/api/players/${encodeURIComponent(id)}/career${refresh ? '?refresh=1' : ''}`));
}

export function compactCareer(c) {
  return {
    unit: c.unit, gradeLabel: c.gradeLabel, fetchedAt: c.fetchedAt,
    seasons: c.seasons.map(({ league, phase, season, teams, snaps, grade }) => ({ league, phase, season, teams, snaps, grade })),
  };
}
