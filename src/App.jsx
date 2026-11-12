import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DepthChart from './components/DepthChart.jsx';
import RosterTable from './components/RosterTable.jsx';
import PlayerPanel from './components/PlayerPanel.jsx';
import Compare from './components/Compare.jsx';
import { GRADE_MODES, RESERVE_STATUSES, gradeFor, loadPref, savePref } from './lib.js';
import * as api from './api.js';

const TABS = ['depth', 'roster', 'compare'];
const SAVE_DELAY_MS = 600;
const UNDO_LIMIT = 30;

// Navigation lives in the URL hash so the browser/phone Back gesture works:
// #depth, #roster, #compare for tabs and #player-<id> for a player page.
function readHash() {
  const h = decodeURIComponent(window.location.hash.slice(1));
  if (h.startsWith('player-')) return { player: h.slice('player-'.length) };
  if (TABS.includes(h)) return { tab: h };
  return {};
}

export default function App() {
  const [roster, setRoster] = useState(null);
  const [pff, setPff] = useState(null);
  const initial = readHash();
  const [tab, setTab] = useState(initial.tab ?? 'depth');
  const [selected, setSelected] = useState(initial.player ?? null); // player id or 'new'
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const [careers, setCareers] = useState({});
  const [contracts, setContracts] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  // How grades are shown: team-wide mode plus per-player overrides (this browser only).
  const [teamMode, setTeamModeState] = useState(() => loadPref('gradeMode', 'season'));
  const [overrides, setOverridesState] = useState(() => loadPref('gradeOverrides', {}));
  const setTeamMode = (m) => { setTeamModeState(m); savePref('gradeMode', m); };
  const setOverride = useCallback((id, m) => {
    setOverridesState((o) => {
      const next = { ...o };
      if (m == null) delete next[id]; else next[id] = m;
      savePref('gradeOverrides', next);
      return next;
    });
  }, []);
  const clearOverrides = () => { setOverridesState({}); savePref('gradeOverrides', {}); };

  const [storage, setStorage] = useState(api.MODE === 'server' ? 'server' : 'loading');

  // ---- Autosave: every roster change is saved shortly after it happens ----
  const [saveState, setSaveState] = useState('saved'); // saved | pending | saving | error | unavailable
  const [saveError, setSaveError] = useState('');
  const latest = useRef(null);
  const savedJson = useRef(null);
  const inFlight = useRef(false);
  latest.current = roster;

  const flush = useCallback(async () => {
    if (inFlight.current || !latest.current) return;
    const snapshot = latest.current;
    const json = JSON.stringify(snapshot);
    if (json === savedJson.current) { setSaveState('saved'); return; }
    inFlight.current = true;
    setSaveState('saving');
    let failed = false;
    try {
      await api.saveRoster(snapshot);
      savedJson.current = json;
      setSaveError('');
    } catch (e) {
      failed = true;
      setSaveError(e.message);
      setSaveState('error');
    } finally {
      inFlight.current = false;
    }
    if (failed) return;
    // Changes made while that save was running go out next, one save at a time.
    if (JSON.stringify(latest.current) !== savedJson.current) flush();
    else setSaveState('saved');
  }, []);

  useEffect(() => {
    if (!roster || storage === 'loading') return undefined;
    if (JSON.stringify(roster) === savedJson.current) return undefined;
    if (storage === 'none') { setSaveState('unavailable'); return undefined; }
    setSaveState((s) => (s === 'error' ? s : 'pending'));
    const t = setTimeout(flush, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [roster, storage, flush]);

  useEffect(() => {
    // Save right away when the app is backgrounded or closed (phones).
    const now = () => { if (document.visibilityState === 'hidden') flush(); };
    const warn = (e) => {
      if (latest.current && JSON.stringify(latest.current) !== savedJson.current) { flush(); e.preventDefault(); e.returnValue = ''; }
    };
    document.addEventListener('visibilitychange', now);
    window.addEventListener('beforeunload', warn);
    return () => { document.removeEventListener('visibilitychange', now); window.removeEventListener('beforeunload', warn); };
  }, [flush]);

  // Every edit goes through here so it can be undone.
  const updateRoster = useCallback((next) => {
    const prev = latest.current;
    if (prev && prev !== next) setUndoStack((u) => [...u.slice(-(UNDO_LIMIT - 1)), prev]);
    latest.current = next;
    setRoster(next);
  }, []);
  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    latest.current = prev;
    setRoster(prev);
    setUndoStack(undoStack.slice(0, -1));
  }

  // ---- Navigation ----
  const pushedPlayer = useRef(false);
  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      if (h.player) { setSelected(h.player); return; }
      pushedPlayer.current = false;
      setSelected(null);
      setTab(h.tab ?? 'depth');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const goTab = (t) => { window.location.hash = t; };
  const openPlayer = useCallback((id) => {
    pushedPlayer.current = true;
    window.location.hash = `player-${id}`;
  }, []);
  const closePlayer = useCallback(() => {
    if (pushedPlayer.current) window.history.back();
    else window.location.hash = tab;
  }, [tab]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  // ---- Loading ----
  const load = useCallback(async () => {
    const data = await api.loadAll();
    savedJson.current = JSON.stringify(data.roster);
    setRoster(data.roster);
    setPff(data.pff);
    setCareers(data.careers);
    setContracts(data.contracts ?? null);
    setStorage(data.storage);
    if (data.storage === 'none') setSaveState('unavailable');
  }, []);

  useEffect(() => { load().catch((e) => setMessage({ type: 'error', text: e.message })); }, [load]);

  const grades = useMemo(() => {
    const out = {};
    for (const p of roster?.players ?? []) {
      out[p.id] = gradeFor(overrides[p.id] ?? teamMode, p, pff?.players?.[p.id], careers[p.id], pff?.meta?.season);
    }
    return out;
  }, [roster, pff, careers, teamMode, overrides]);

  const missingCareers = useMemo(
    () => (roster?.players ?? []).filter((p) => (overrides[p.id] ?? teamMode) !== 'season' && !careers[p.id]).length,
    [roster, careers, teamMode, overrides],
  );

  async function syncCareers(force = false) {
    setBusy('careers');
    setMessage({ type: 'info', text: 'Fetching career history from PFF… PFF limits reads per minute, so a full refresh can take a few minutes.' });
    try {
      const data = await api.syncCareers(force);
      setCareers(data.careers);
      setMessage({
        type: data.failed.length ? 'info' : 'ok',
        text: `Career history: ${data.fetched} fetched, ${data.upToDate} already up to date.${data.failed.length ? ` Failed: ${data.failed.join('; ')}` : ''}`,
      });
    } catch (e) {
      setMessage({ type: 'error', text: `Career sync failed: ${e.message}` });
    } finally { setBusy(''); }
  }

  async function syncPff() {
    setBusy('sync');
    setMessage({ type: 'info', text: 'Syncing PFF data… this can take a minute.' });
    try {
      const data = await api.syncPff();
      setPff(await api.reloadPff());
      const extra = [...(data.unmatched?.length ? [`Unmatched: ${data.unmatched.join(', ')}`] : []), ...(data.warnings ?? [])];
      setMessage({ type: extra.length ? 'info' : 'ok', text: `PFF synced: ${data.matched} players matched. ${extra.join(' ')}` });
    } catch (e) {
      setMessage({ type: 'error', text: `PFF sync failed: ${e.message}` });
    } finally { setBusy(''); }
  }

  if (!roster) {
    return <div className="loading">{message ? <p className="msg error">{message.text}</p> : 'Loading roster…'}</div>;
  }

  const counts = {
    active: roster.players.filter((p) => p.status === 'active').length,
    ps: roster.players.filter((p) => p.status === 'practice_squad').length,
    reserve: roster.players.filter((p) => RESERVE_STATUSES.includes(p.status)).length,
    fa: roster.players.filter((p) => p.status === 'free_agent').length,
  };
  const syncedAt = pff?.meta?.syncedAt ? new Date(pff.meta.syncedAt).toLocaleString() : 'never';
  const saveLabel = {
    saved: 'All changes saved',
    pending: 'Saving…',
    saving: 'Saving…',
    error: 'Couldn’t save',
    unavailable: 'Saving is off in this view',
  }[saveState];

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <span className="logo" aria-hidden>C</span>
          <div>
            <h1>{roster.team.name}</h1>
            <p className="sub">{roster.team.season} roster · source: {roster.source?.name} · PFF {api.MODE === 'artifact' ? 'snapshot' : 'synced'} {syncedAt}</p>
          </div>
        </div>
        <div className="actions">
          <span className={`save-state save-${saveState}`} role="status" title={saveError || undefined}>{saveLabel}</span>
          {saveState === 'error' && <button onClick={flush}>Retry</button>}
          <button onClick={undo} disabled={!undoStack.length} title="Undo the last change">Undo</button>
          {api.canSync && <button onClick={syncPff} disabled={!!busy}>{busy === 'sync' ? 'Syncing…' : 'Sync PFF'}</button>}
        </div>
      </header>

      <section className="summary">
        <Stat label="Active roster" value={`${counts.active}/53`} warn={counts.active > 53} />
        <Stat label="Practice squad" value={`${counts.ps}/17`} warn={counts.ps > 17} />
        <Stat label="Reserve lists" value={counts.reserve} />
        <Stat label="Free-agent targets" value={counts.fa} />
        <div className="coaches">
          {roster.coaches?.map((c) => <span key={c.role}><b>{c.role}</b> {c.name}</span>)}
        </div>
      </section>

      <section className="grade-mode">
        <span className="grade-mode-label">Grades</span>
        <div className="segmented" role="group" aria-label="Grade shown for the whole team">
          {Object.entries(GRADE_MODES).map(([k, m]) => (
            <button key={k} aria-pressed={teamMode === k} onClick={() => setTeamMode(k)}>{m.label}</button>
          ))}
        </div>
        <span className="hint">
          {{ season: `PFF ${pff?.meta?.season ?? ''} regular season + playoffs.`, nfl: 'Career average (regular season + playoffs), weighted by snaps.', all: 'Includes college seasons — mainly for young players.', pre: 'Preseason-only career average, weighted by snaps.' }[teamMode]}
          {Object.keys(overrides).length > 0 && <> {Object.keys(overrides).length} player override{Object.keys(overrides).length > 1 ? 's' : ''} · <button className="link" onClick={clearOverrides}>reset</button></>}
        </span>
        <span className="legend-grades" aria-label="Grade colours">
          <span><span className="grade good">70.0</span> NFL</span>
          <span><span className="grade good pre">70.0</span> Preseason</span>
          <span><span className="grade good college">70.0</span> College</span>
        </span>
        <span className="spacer" />
        {missingCareers > 0 && <span className="hint">{missingCareers} players have no career data yet.</span>}
        {api.canSync && <button onClick={() => syncCareers(false)} disabled={!!busy}>{busy === 'careers' ? 'Fetching careers…' : 'Sync careers'}</button>}
      </section>

      {saveState === 'unavailable' && (
        <p className="msg info" role="status">You can browse and edit, but changes can’t be saved in this view. Open the page on claude.ai while signed in.</p>
      )}
      {saveState === 'error' && (
        <p className="msg error" role="status">Your last change wasn’t saved: {saveError} <button className="link" onClick={flush}>Try again</button></p>
      )}

      {message && (
        <p className={`msg ${message.type}`} role="status">
          {message.text} <button className="link" onClick={() => setMessage(null)}>Dismiss</button>
        </p>
      )}

      <nav className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'depth'} onClick={() => goTab('depth')}>Depth chart</button>
        <button role="tab" aria-selected={tab === 'roster'} onClick={() => goTab('roster')}>Full roster</button>
        <button role="tab" aria-selected={tab === 'compare'} onClick={() => goTab('compare')}>PFF comparison</button>
      </nav>

      <main>
        {tab === 'depth' && <DepthChart roster={roster} pff={pff} grades={grades} onChange={updateRoster} onSelect={openPlayer} />}
        {tab === 'roster' && <RosterTable roster={roster} pff={pff} grades={grades} contracts={contracts} overrides={overrides} teamMode={teamMode} onOverride={setOverride} onSelect={openPlayer} />}
        {tab === 'compare' && <Compare roster={roster} pff={pff} grades={grades} teamMode={teamMode} onSelect={openPlayer} />}
      </main>

      {selected && (selected === 'new' || roster.players.some((p) => p.id === selected)) && (
        <PlayerPanel
          key={selected}
          roster={roster}
          pff={pff}
          contracts={contracts}
          playerId={selected}
          teamMode={teamMode}
          override={overrides[selected]}
          onOverride={setOverride}
          onCareerLoaded={(id, c) => setCareers((cs) => ({ ...cs, [id]: c }))}
          onChange={updateRoster}
          onClose={closePlayer}
          backLabel={{ depth: 'Depth chart', roster: 'Full roster', compare: 'PFF comparison' }[tab]}
        />
      )}
    </div>
  );
}

function Stat({ label, value, warn }) {
  return (
    <div className={`stat ${warn ? 'warn' : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
