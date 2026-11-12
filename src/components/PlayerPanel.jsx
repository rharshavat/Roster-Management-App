import { useEffect, useState } from 'react';
import Grade from './Grade.jsx';
import {
  AVAILABILITY, POSITIONS, STATUSES, STATUS_LABELS, TAGS, age, depthSlots, describeAcquisition,
  formatHeight, headline, removeFromDepth, slugify,
} from '../lib.js';

const BLANK = { id: '', name: '', jersey: '', position: 'WR', status: 'practice_squad', acquisition: '', tag: null, availability: null, marker: null, pffId: null, notes: '' };

const STAT_LABELS = {
  gradesOffense: 'Offense', gradesPass: 'Passing', gradesRun: 'Rushing', gradesPassRoute: 'Receiving',
  gradesPassBlock: 'Pass block', gradesRunBlock: 'Run block', snapCountsTotal: 'Snaps',
  snapCountsPassRoute: 'Routes', snapCountsPassBlock: 'Pass-block snaps', snapCountsRunBlock: 'Run-block snaps',
  gradesDefense: 'Defense', gradesRunDefense: 'Run defense', gradesPassRushDefense: 'Pass rush',
  gradesCoverageDefense: 'Coverage', gradesTackle: 'Tackling', snapCountsDefense: 'Snaps', tackles: 'Tackles',
  sacks: 'Sacks', hurries: 'Hurries', interceptions: 'INTs', missedTackles: 'Missed tackles',
  gradesMiscSt: 'Special teams', gradesKickReturn: 'Kick return', gradesPuntReturn: 'Punt return',
  gradesPunter: 'Punting', gradesFgepKicker: 'FG/XP', gradesKickoffKicker: 'Kickoff', gradesLongSnap: 'Long snap',
  totalSnaps: 'Snaps', playerGameCount: 'Games',
};

export default function PlayerPanel({ roster, pff, playerId, onChange, onClose }) {
  const isNew = playerId === 'new';
  const existing = roster.players.find((p) => p.id === playerId);
  const [form, setForm] = useState(existing ?? BLANK);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!isNew && !existing) return null;
  const data = pff?.players?.[playerId];
  const h = headline(data, form);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value === '' ? (k === 'notes' || k === 'name' || k === 'jersey' ? '' : null) : e.target.value });

  function apply() {
    if (!form.name.trim()) return setError('Name is required.');
    let next = roster;
    let player = { ...form, name: form.name.trim(), pffId: form.pffId ? Number(form.pffId) : null };
    if (isNew) {
      let id = slugify(player.name), n = 2;
      while (roster.players.some((p) => p.id === id)) id = `${slugify(player.name)}-${n++}`;
      player.id = id;
      next = { ...roster, players: [...roster.players, player] };
    } else {
      next = { ...roster, players: roster.players.map((p) => (p.id === player.id ? player : p)) };
      // Leaving the active roster takes a player off the game-day depth chart.
      if (existing.status === 'active' && player.status !== 'active' && player.status !== 'practice_squad') {
        next = removeFromDepth(next, player.id);
      }
    }
    onChange(next);
    onClose();
  }

  function remove() {
    if (!confirm(`Remove ${existing.name} from the roster?`)) return;
    const next = removeFromDepth(roster, existing.id);
    onChange({ ...next, players: next.players.filter((p) => p.id !== existing.id) });
    onClose();
  }

  const bio = data?.bio;
  const slots = isNew ? [] : depthSlots(roster, playerId);

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="panel" role="dialog" aria-modal="true" aria-label={form.name || 'New player'} onClick={(e) => e.stopPropagation()}>
        <header className={`panel-head tag-${form.tag ?? 'none'}`}>
          <div>
            <h2>{isNew ? 'Add player' : <>{form.jersey && <span className="jersey">#{form.jersey}</span>} {form.name}</>}</h2>
            {!isNew && <p className="sub">{form.position} · {STATUS_LABELS[form.status]}{slots.length ? ` · ${slots.join(', ')}` : ''}</p>}
          </div>
          <button className="close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {!isNew && (
          <section className="panel-section">
            <h3>Profile</h3>
            <dl className="facts">
              <Fact k="Acquired" v={[form.acquisition, describeAcquisition(form.acquisition) !== form.acquisition && describeAcquisition(form.acquisition)].filter(Boolean).join(' — ')} />
              <Fact k="Newcomer" v={TAGS[form.tag]} />
              <Fact k="Availability" v={form.availability && `${form.availability} — ${AVAILABILITY[form.availability] ?? ''}`} />
              {bio && <>
                <Fact k="Age" v={age(bio.dob) != null && `${age(bio.dob)} (born ${bio.dob})`} />
                <Fact k="Size" v={bio.height && `${formatHeight(bio.height)}, ${bio.weight} lb`} />
                <Fact k="College" v={bio.college} />
                <Fact k="Draft" v={bio.draft?.round ? `${bio.draft.season} round ${bio.draft.round}, pick ${bio.draft.pick} (${bio.draft.team})` : 'Undrafted'} />
                <Fact k="PFF position" v={bio.position} />
              </>}
            </dl>
          </section>
        )}

        {!isNew && (
          <section className="panel-section">
            <h3>PFF {pff?.meta?.season}</h3>
            {!data ? <p className="hint">No PFF match yet. Run Sync PFF, or set the PFF player id below.</p> : (
              <>
                <div className="headline">
                  <Grade value={h.grade} rank={h.rank} of={h.of} title={h.label} />
                  <div>
                    <div>{h.label ?? 'No grade yet'}{h.rank ? ` · #${h.rank} of ${h.of}` : ''}</div>
                    {data.depth && <div className="sub">PFF depth chart: {data.depth.slots.join(', ')} · {data.depth.snaps} snaps ({data.depth.snapPct}%) · {data.depth.status}</div>}
                  </div>
                </div>
                {['offense', 'defense', 'specialTeams'].map((k) => data[k] && Object.keys(data[k]).length > 0 && (
                  <div key={k} className="stats">
                    <h4>{k === 'specialTeams' ? 'Special teams' : k[0].toUpperCase() + k.slice(1)}</h4>
                    <dl>
                      {Object.entries(data[k]).map(([sk, v]) => (
                        <div key={sk}><dt>{STAT_LABELS[sk] ?? sk}</dt><dd>{sk.startsWith('grades') ? <Grade value={v} /> : v}</dd></div>
                      ))}
                    </dl>
                  </div>
                ))}
              </>
            )}
          </section>
        )}

        <section className="panel-section">
          <h3>{isNew ? 'Details' : 'Edit'}</h3>
          <div className="form">
            <label>Name<input value={form.name} onChange={set('name')} autoFocus={isNew} /></label>
            <label>Jersey<input value={form.jersey} onChange={set('jersey')} inputMode="numeric" /></label>
            <label>Position
              <select value={form.position} onChange={set('position')}>
                {[...new Set([...POSITIONS, form.position])].map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label>Status
              <select value={form.status} onChange={set('status')}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <label>Acquisition (Ourlads code)<input value={form.acquisition ?? ''} onChange={set('acquisition')} placeholder="e.g. 26/3, CF26, U/Phi" /></label>
            <label>Newcomer
              <select value={form.tag ?? ''} onChange={set('tag')}>
                <option value="">Returning</option>
                {Object.entries(TAGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Availability
              <select value={form.availability ?? ''} onChange={set('availability')}>
                <option value="">—</option>
                {Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
              </select>
            </label>
            <label>PFF player id<input value={form.pffId ?? ''} onChange={set('pffId')} inputMode="numeric" placeholder={data?.pffId ? `auto: ${data.pffId}` : 'auto'} /></label>
            <label className="wide">Notes<textarea rows={3} value={form.notes ?? ''} onChange={set('notes')} /></label>
          </div>
          {error && <p className="msg error">{error}</p>}
          <div className="panel-actions">
            {!isNew && <button className="danger" onClick={remove}>Remove player</button>}
            <span className="spacer" />
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={apply}>{isNew ? 'Add player' : 'Apply'}</button>
          </div>
          <p className="hint">Changes stay local until you press “Save changes” at the top.</p>
        </section>
      </aside>
    </div>
  );
}

function Fact({ k, v }) {
  if (!v) return null;
  return <div><dt>{k}</dt><dd>{v}</dd></div>;
}
