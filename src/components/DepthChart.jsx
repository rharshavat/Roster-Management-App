import { useState } from 'react';
import Grade from './Grade.jsx';
import { AVAILABILITY, POSITIONS, RESERVE_STATUSES, TAGS, UNITS, depthSlots, describeAcquisition, rosterMoves, setStatus } from '../lib.js';

export default function DepthChart({ roster, grades, onChange, onSelect }) {
  const [editing, setEditing] = useState(false);
  const byId = Object.fromEntries(roster.players.map((p) => [p.id, p]));

  function updateSlot(unit, idx, players) {
    const slots = roster.depthChart[unit].map((s, i) => (i === idx ? { ...s, players } : s));
    onChange({ ...roster, depthChart: { ...roster.depthChart, [unit]: slots } });
  }
  // Putting a practice-squad player or free agent on the depth chart
  // moves them to the active roster.
  function addToSlot(unit, idx, pid) {
    const slots = roster.depthChart[unit].map((s, i) => (i === idx ? { ...s, players: [...s.players, pid] } : s));
    const next = { ...roster, depthChart: { ...roster.depthChart, [unit]: slots } };
    onChange(byId[pid].status === 'active' ? next : setStatus(next, pid, 'active'));
  }
  const movePlayer = (pid, status) => onChange(setStatus(roster, pid, status));
  function move(unit, idx, from, to) {
    const players = [...roster.depthChart[unit][idx].players];
    if (to < 0 || to >= players.length) return;
    [players[from], players[to]] = [players[to], players[from]];
    updateSlot(unit, idx, players);
  }

  const ps = roster.players.filter((p) => p.status === 'practice_squad');
  const reserves = roster.players.filter((p) => RESERVE_STATUSES.includes(p.status));
  const freeAgents = roster.players.filter((p) => p.status === 'free_agent');
  const offChart = roster.players.filter((p) => p.status === 'active'
    && !depthSlots(roster, p.id).some((s) => !/^(PT|PK|LS|H|KO|PR|KR)\d/.test(s) || ['P', 'K', 'LS'].includes(p.position)));
  const listProps = { grades, onSelect, onMove: editing ? movePlayer : null };

  return (
    <div className="depth">
      <div className="toolbar">
        <Legend />
        <button onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
          {editing ? 'Done editing' : 'Edit depth chart'}
        </button>
      </div>

      {UNITS.map(({ key, label }) => (
        <section key={key} className="unit">
          <h2>{label} {key !== 'specialTeams' && roster.schemes?.[key] && <small>{roster.schemes[key]}</small>}</h2>
          <div className="table-wrap">
            <table className="depth-table">
              <thead><tr><th>Pos</th><th>Starter</th><th>2nd</th><th>3rd</th>{editing && <th />}</tr></thead>
              <tbody>
                {roster.depthChart[key].map((slot, idx) => (
                  <tr key={slot.slot}>
                    <th scope="row">{slot.slot}</th>
                    {[0, 1, 2].map((i) => {
                      const id = slot.players[i];
                      return (
                        <td key={i}>
                          {id && (
                            <PlayerChip
                              player={byId[id]} grade={grades[id]} onSelect={onSelect}
                              controls={editing && (
                                <span className="chip-controls">
                                  <button title="Move up the depth chart" disabled={i === 0} onClick={() => move(key, idx, i, i - 1)}>◀</button>
                                  <button title="Move down the depth chart" disabled={i === slot.players.length - 1} onClick={() => move(key, idx, i, i + 1)}>▶</button>
                                  <button title="Remove from this slot" onClick={() => updateSlot(key, idx, slot.players.filter((p) => p !== id))}>✕</button>
                                </span>
                              )}
                            />
                          )}
                        </td>
                      );
                    })}
                    {editing && (
                      <td>
                        <AddToSlot roster={roster} exclude={slot.players} onAdd={(pid) => addToSlot(key, idx, pid)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {slotOverflow(roster.depthChart[key]) && <p className="hint">Some slots have more than three players; open a player to see their full depth position.</p>}
        </section>
      ))}

      {offChart.length > 0 && (
        <section className="unit">
          <h2>Active, not on the depth chart <small>{offChart.length}</small></h2>
          <GroupedList players={offChart} {...listProps} />
        </section>
      )}

      <section className="unit">
        <h2>Practice squad <small>{ps.length}/17</small></h2>
        <GroupedList players={ps} {...listProps} />
      </section>

      <section className="unit">
        <h2>Reserves <small>{reserves.length}</small></h2>
        <GroupedList players={reserves} {...listProps} groupBy="status" />
      </section>

      <section className="unit">
        <h2>Free-agent targets <small>{freeAgents.length}</small></h2>
        <GroupedList players={freeAgents} {...listProps} />
      </section>
      {!editing && <p className="hint">Tap “Edit depth chart” to move players between the roster, practice squad, IR and free-agent targets, or open any player.</p>}
    </div>
  );
}

function slotOverflow(slots) { return slots.some((s) => s.players.length > 3); }

function PlayerChip({ player, grade: h = {}, onSelect, controls }) {
  if (!player) return null;
  return (
    <div className={`chip tag-${player.tag ?? 'none'}`}>
      <button className="chip-main" onClick={() => onSelect(player.id)} title={[TAGS[player.tag], describeAcquisition(player.acquisition)].filter(Boolean).join(' · ')}>
        <span className="jersey">{player.jersey}</span>
        <span className="name">{player.name}</span>
        {player.acquisition && <span className="acq">{player.acquisition}</span>}
        {player.availability && <span className={`avail avail-${player.availability}`} title={AVAILABILITY[player.availability]}>{player.availability}</span>}
        <Grade value={h.grade} rank={h.rank} of={h.of} title={h.label} mode={h.mode} snaps={h.snaps ?? null} />
      </button>
      {controls}
    </div>
  );
}

const ORDER = ['active', 'practice_squad', 'free_agent'];

function AddToSlot({ roster, exclude, onAdd }) {
  const options = roster.players
    .filter((p) => !exclude.includes(p.id) && !RESERVE_STATUSES.includes(p.status))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.name.localeCompare(b.name));
  return (
    <select aria-label="Add player to slot" value="" onChange={(e) => e.target.value && onAdd(e.target.value)}>
      <option value="">+ Add…</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>{p.position} {p.name}{p.status === 'practice_squad' ? ' (PS)' : p.status === 'free_agent' ? ' (FA)' : ''}</option>
      ))}
    </select>
  );
}

function GroupedList({ players, grades, onSelect, onMove, groupBy = 'position' }) {
  if (!players.length) return <p className="hint">None.</p>;
  const groups = {};
  for (const p of players) (groups[groupBy === 'status' ? p.status.replace('_', ' ') : p.position] ??= []).push(p);
  const keys = groupBy === 'position'
    ? Object.keys(groups).sort((a, b) => POSITIONS.indexOf(a) - POSITIONS.indexOf(b))
    : Object.keys(groups);
  return (
    <div className="table-wrap">
      <table className="depth-table">
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <th scope="row">{groupBy === 'status' ? k.toUpperCase() : k}</th>
              <td className="chips">
                {groups[k].map((p) => (
                  <span key={p.id} className="chip-row-item">
                    <PlayerChip player={p} grade={grades[p.id]} onSelect={onSelect} />
                    {groupBy === 'status' && <span className="pos-badge">{p.position}</span>}
                    {onMove && (
                      <select className="move-select" aria-label={`Move ${p.name}`} value="" onChange={(e) => e.target.value && onMove(p.id, e.target.value)}>
                        <option value="">Move…</option>
                        {rosterMoves(p.status).map(([to, label]) => <option key={to} value={to}>{label}</option>)}
                      </select>
                    )}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span className="chip-swatch tag-none">Returning</span>
      <span className="chip-swatch tag-new">{TAGS.new}</span>
      <span className="chip-swatch tag-draft">{TAGS.draft}</span>
      <span className="chip-swatch tag-udfa">{TAGS.udfa}</span>
    </div>
  );
}
