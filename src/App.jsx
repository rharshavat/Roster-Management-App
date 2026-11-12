import { useCallback, useEffect, useMemo, useState } from 'react';
import DepthChart from './components/DepthChart.jsx';
import RosterTable from './components/RosterTable.jsx';
import PlayerPanel from './components/PlayerPanel.jsx';
import Compare from './components/Compare.jsx';
import { GRADE_MODES, RESERVE_STATUSES, gradeFor, loadPref, savePref } from './lib.js';

export default function App() {
  const [saved, setSaved] = useState(null); // last roster from server
  const [roster, setRoster] = useState(null); // working copy
  const [pff, setPff] = useState(null);
  const [tab, setTab] = useState('depth');
  const [selected, setSelected] = useState(null); // player id or 'new'
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const [careers, setCareers] = useState({});
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

  const load = useCallback(async () => {
    const res = await fetch('/api/roster');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setSaved(data.roster);
    setRoster(data.roster);
    setPff(data.pff);
    const c = await fetch('/api/careers');
    if (c.ok) setCareers(await c.json());
  }, []);

  useEffect(() => { load().catch((e) => setMessage({ type: 'error', text: e.message })); }, [load]);

  const grades = useMemo(() => {
    const out = {};
    for (const p of roster?.players ?? []) {
      out[p.id] = gradeFor(overrides[p.id] ?? teamMode, p, pff?.players?.[p.id], careers[p.id]);
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
      const res = await fetch('/api/careers/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCareers(data.careers);
      setMessage({
        type: data.failed.length ? 'info' : 'ok',
        text: `Career history: ${data.fetched} fetched, ${data.upToDate} already up to date.${data.failed.length ? ` Failed: ${data.failed.join('; ')}` : ''}`,
      });
    } catch (e) {
      setMessage({ type: 'error', text: `Career sync failed: ${e.message}` });
    } finally { setBusy(''); }
  }

  const dirty = useMemo(() => roster && saved && JSON.stringify(roster) !== JSON.stringify(saved), [roster, saved]);

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    setBusy('save');
    try {
      const res = await fetch('/api/roster', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(roster),
      });
      const data = await res.json();
      if (!res.ok) throw new Error([data.error, ...(data.details ?? [])].join('\n'));
      setSaved(roster);
      setMessage({ type: 'ok', text: 'Roster saved.' });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally { setBusy(''); }
  }

  async function syncPff() {
    setBusy('sync');
    setMessage({ type: 'info', text: 'Syncing PFF data… this can take a minute.' });
    try {
      const res = await fetch('/api/pff/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const r = await fetch('/api/roster');
      setPff((await r.json()).pff);
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
  };
  const syncedAt = pff?.meta?.syncedAt ? new Date(pff.meta.syncedAt).toLocaleString() : 'never';

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <span className="logo" aria-hidden>C</span>
          <div>
            <h1>{roster.team.name}</h1>
            <p className="sub">{roster.team.season} roster · source: {roster.source?.name} · PFF synced {syncedAt}</p>
          </div>
        </div>
        <div className="actions">
          <button onClick={syncPff} disabled={!!busy}>{busy === 'sync' ? 'Syncing…' : 'Sync PFF'}</button>
          <button onClick={() => setRoster(saved)} disabled={!dirty || !!busy}>Discard</button>
          <button className="primary" onClick={save} disabled={!dirty || !!busy}>{busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        </div>
      </header>

      <section className="summary">
        <Stat label="Active roster" value={`${counts.active}/53`} warn={counts.active > 53} />
        <Stat label="Practice squad" value={`${counts.ps}/17`} warn={counts.ps > 17} />
        <Stat label="Reserve lists" value={counts.reserve} />
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
        <span className="spacer" />
        {missingCareers > 0 && <span className="hint">{missingCareers} players have no career data yet.</span>}
        <button onClick={() => syncCareers(false)} disabled={!!busy}>{busy === 'careers' ? 'Fetching careers…' : 'Sync careers'}</button>
      </section>

      {message && (
        <p className={`msg ${message.type}`} role="status">
          {message.text} <button className="link" onClick={() => setMessage(null)}>Dismiss</button>
        </p>
      )}

      <nav className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'depth'} onClick={() => setTab('depth')}>Depth chart</button>
        <button role="tab" aria-selected={tab === 'roster'} onClick={() => setTab('roster')}>Full roster</button>
        <button role="tab" aria-selected={tab === 'compare'} onClick={() => setTab('compare')}>PFF comparison</button>
      </nav>

      <main>
        {tab === 'depth' && <DepthChart roster={roster} pff={pff} grades={grades} onChange={setRoster} onSelect={setSelected} />}
        {tab === 'roster' && <RosterTable roster={roster} pff={pff} grades={grades} overrides={overrides} teamMode={teamMode} onOverride={setOverride} onSelect={setSelected} />}
        {tab === 'compare' && <Compare roster={roster} pff={pff} grades={grades} teamMode={teamMode} onSelect={setSelected} />}
      </main>

      {selected && (
        <PlayerPanel
          key={selected}
          roster={roster}
          pff={pff}
          playerId={selected}
          teamMode={teamMode}
          override={overrides[selected]}
          onOverride={setOverride}
          onCareerLoaded={(id, c) => setCareers((cs) => ({ ...cs, [id]: c }))}
          onChange={setRoster}
          onClose={() => setSelected(null)}
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
