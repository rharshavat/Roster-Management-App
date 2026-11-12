import { useMemo, useState } from 'react';
import Grade from './Grade.jsx';
import { POSITIONS, RESERVE_STATUSES, STATUS_LABELS, TAGS, age, depthSlots, describeAcquisition, formatHeight, headline } from '../lib.js';

const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'active', label: 'Active', test: (p) => p.status === 'active' },
  { key: 'ps', label: 'Practice squad', test: (p) => p.status === 'practice_squad' },
  { key: 'reserve', label: 'Reserves', test: (p) => RESERVE_STATUSES.includes(p.status) },
];

const COLUMNS = [
  { key: 'jersey', label: '#', value: (r) => Number(r.p.jersey) || 0 },
  { key: 'name', label: 'Player', value: (r) => r.p.name.split(' ').slice(1).join(' ') },
  { key: 'pos', label: 'Pos', value: (r) => POSITIONS.indexOf(r.p.position) },
  { key: 'status', label: 'Status', value: (r) => r.p.status },
  { key: 'depth', label: 'Depth', value: (r) => r.slots.join(',') || '~' },
  { key: 'acq', label: 'Acquired', value: (r) => r.p.acquisition ?? '' },
  { key: 'age', label: 'Age', value: (r) => r.age ?? 99 },
  { key: 'size', label: 'Ht / Wt', value: (r) => r.bio?.height ?? 0 },
  { key: 'college', label: 'College', value: (r) => r.bio?.college ?? '' },
  { key: 'grade', label: 'PFF', value: (r) => r.h.grade ?? -1 },
  { key: 'snaps', label: 'Snaps', value: (r) => r.h.snaps ?? -1 },
];

export default function RosterTable({ roster, pff, onSelect }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState('');
  const [sort, setSort] = useState({ key: 'pos', dir: 1 });

  const rows = useMemo(() => {
    const test = FILTERS.find((f) => f.key === filter).test;
    const q = query.trim().toLowerCase();
    const col = COLUMNS.find((c) => c.key === sort.key);
    return roster.players
      .filter((p) => test(p) && (!pos || p.position === pos) && (!q || p.name.toLowerCase().includes(q) || p.jersey === q))
      .map((p) => {
        const d = pff?.players?.[p.id];
        return { p, bio: d?.bio, h: headline(d, p), age: age(d?.bio?.dob), slots: depthSlots(roster, p.id) };
      })
      .sort((a, b) => {
        const va = col.value(a), vb = col.value(b);
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir || a.p.name.localeCompare(b.p.name);
      });
  }, [roster, pff, filter, query, pos, sort]);

  const positions = [...new Set(roster.players.map((p) => p.position))].sort((a, b) => POSITIONS.indexOf(a) - POSITIONS.indexOf(b));

  return (
    <div className="roster">
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Roster filter">
          {FILTERS.map((f) => (
            <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} <span className="count">{roster.players.filter(f.test).length}</span>
            </button>
          ))}
        </div>
        <select aria-label="Position" value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="">All positions</option>
          {positions.map((p) => <option key={p}>{p}</option>)}
        </select>
        <input type="search" placeholder="Search name or #" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button onClick={() => onSelect('new')}>+ Add player</button>
      </div>

      <div className="table-wrap">
        <table className="roster-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                  <button className="sort" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 }))}>
                    {c.label}{sort.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, bio, h, age: a, slots }) => (
              <tr key={p.id} onClick={() => onSelect(p.id)} className="clickable">
                <td className="num">{p.jersey}</td>
                <td>
                  <span className={`dot tag-${p.tag ?? 'none'}`} title={TAGS[p.tag] ?? 'Returning'} />
                  <button className="link" onClick={(e) => { e.stopPropagation(); onSelect(p.id); }}>{p.name}</button>
                  {p.availability && <span className={`avail avail-${p.availability}`}>{p.availability}</span>}
                </td>
                <td>{p.position}</td>
                <td><span className={`status status-${p.status}`}>{STATUS_LABELS[p.status]}</span></td>
                <td>{slots.join(', ')}</td>
                <td title={describeAcquisition(p.acquisition)}>{p.acquisition}</td>
                <td className="num">{a ?? ''}</td>
                <td>{bio ? `${formatHeight(bio.height)} / ${bio.weight ?? ''}` : ''}</td>
                <td>{bio?.college?.replace(/\s+\S+$/, '') ?? ''}</td>
                <td><Grade value={h.grade} rank={h.rank} of={h.of} title={h.label} /></td>
                <td className="num">{h.snaps ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="hint">No players match.</p>}
      </div>
    </div>
  );
}
