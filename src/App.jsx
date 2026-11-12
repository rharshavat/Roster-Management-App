import { useCallback, useEffect, useMemo, useState } from 'react';
import DepthChart from './components/DepthChart.jsx';
import RosterTable from './components/RosterTable.jsx';
import PlayerPanel from './components/PlayerPanel.jsx';
import { RESERVE_STATUSES } from './lib.js';

export default function App() {
  const [saved, setSaved] = useState(null); // last roster from server
  const [roster, setRoster] = useState(null); // working copy
  const [pff, setPff] = useState(null);
  const [tab, setTab] = useState('depth');
  const [selected, setSelected] = useState(null); // player id or 'new'
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/roster');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setSaved(data.roster);
    setRoster(data.roster);
    setPff(data.pff);
  }, []);

  useEffect(() => { load().catch((e) => setMessage({ type: 'error', text: e.message })); }, [load]);

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

      {message && (
        <p className={`msg ${message.type}`} role="status">
          {message.text} <button className="link" onClick={() => setMessage(null)}>Dismiss</button>
        </p>
      )}

      <nav className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'depth'} onClick={() => setTab('depth')}>Depth chart</button>
        <button role="tab" aria-selected={tab === 'roster'} onClick={() => setTab('roster')}>Full roster</button>
      </nav>

      <main>
        {tab === 'depth'
          ? <DepthChart roster={roster} pff={pff} onChange={setRoster} onSelect={setSelected} />
          : <RosterTable roster={roster} pff={pff} onSelect={setSelected} />}
      </main>

      {selected && (
        <PlayerPanel
          key={selected}
          roster={roster}
          pff={pff}
          playerId={selected}
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
