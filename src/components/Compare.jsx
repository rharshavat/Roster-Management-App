import { useMemo, useState } from 'react';
import Grade from './Grade.jsx';
import { GRADE_MODES, STATUS_LABELS, depthSlots } from '../lib.js';

// Our (Ourlads) slot names → PFF depth-chart alignments.
const SLOT_MAP = {
  QB: ['QB'], RB: ['HB'], LWR: ['LWR'], RWR: ['RWR'], SWR: ['SWR'], TE: ['TE-L', 'TE-R'],
  LT: ['LT'], LG: ['LG'], C: ['C'], RG: ['RG'], RT: ['RT'],
  LDE: ['DLE'], LDT: ['DLT'], RDT: ['DRT'], RDE: ['DRE'],
  WLB: ['WLB'], MLB: ['MLB'], LCB: ['LCB'], RCB: ['RCB'], NB: ['SCB'], FS: ['FS'], SS: ['SS'],
};
const GRADE_GAP = 5; // a backup this many points better than the starter gets flagged

export default function Compare({ roster, pff, grades, teamMode, onSelect }) {
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const analysis = useMemo(() => analyse(roster, pff, grades), [roster, pff, grades]);

  if (!pff?.depthChart?.length) {
    return <p className="hint">No PFF depth chart yet. Press “Sync PFF” first.</p>;
  }

  const total = analysis.units.flatMap((u) => u.rows);
  const differing = total.filter((r) => r.flags.length).length;

  return (
    <div className="compare">
      <div className="toolbar">
        <p className="hint" style={{ margin: 0 }}>
          Your depth chart compared with PFF's ({pff.meta?.season}, synced {new Date(pff.meta?.syncedAt).toLocaleDateString()}).
          {' '}<b>{differing}</b> of {total.length} positions differ.
          {' '}Grades flag a backup who outgrades the starter by {GRADE_GAP}+ points, using the grade setting above ({GRADE_MODES[teamMode].label.toLowerCase()}).
        </p>
        <label className="check"><input type="checkbox" checked={onlyDiffs} onChange={(e) => setOnlyDiffs(e.target.checked)} /> Only show differences</label>
      </div>

      {analysis.units.map((u) => (
        <section key={u.key} className="unit">
          <h2>{u.label}</h2>
          <div className="table-wrap">
            <table className="compare-table">
              <thead><tr><th>Pos</th><th>Your depth chart</th><th>PFF depth chart</th><th>What's different</th></tr></thead>
              <tbody>
                {u.rows.filter((r) => !onlyDiffs || r.flags.length).map((r) => (
                  <tr key={r.slot} className={r.flags.length ? 'diff' : ''}>
                    <th scope="row">{r.slot}{r.pffOnly && <small> PFF only</small>}</th>
                    <td><Names list={r.ours} onSelect={onSelect} /></td>
                    <td><Names list={r.theirs} onSelect={onSelect} showSlot={r.alignments.length > 1} /></td>
                    <td>{r.flags.length ? <ul className="flags">{r.flags.map((f, i) => <li key={i} className={`flag-${f.kind}`}>{f.text}</li>)}</ul> : <span className="match">✓ Same order</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {analysis.statusConflicts.length > 0 && (
        <section className="unit">
          <h2>Roster status conflicts</h2>
          <p className="hint">PFF has these players on its depth chart, but they aren't on your active roster.</p>
          <ul className="flags">
            {analysis.statusConflicts.map((c) => (
              <li key={c.pffId} className="flag-status">
                {c.ourId ? <button className="link" onClick={() => onSelect(c.ourId)}>{c.name}</button> : c.name}
                {' '}— PFF: {c.alignment}{c.depthOrder}; you: {c.ourStatus}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="hint">PFF's depth chart has no special-teams slots, so special teams aren't compared.</p>
    </div>
  );
}

function Names({ list, onSelect, showSlot }) {
  if (!list.length) return <span className="hint">—</span>;
  return (
    <ol className="names">
      {list.map((n, i) => (
        <li key={`${n.key}-${i}`}>
          {n.ourId ? <button className="link" onClick={() => onSelect(n.ourId)}>{n.name}</button> : <span>{n.name}</span>}
          {showSlot && n.slot && <small className="muted"> {n.slot}</small>}
          {' '}<Grade value={n.grade} title={n.gradeLabel} mode={n.mode} snaps={n.snaps ?? null} />
        </li>
      ))}
    </ol>
  );
}

function analyse(roster, pff, grades) {
  const byId = Object.fromEntries(roster.players.map((p) => [p.id, p]));
  const gradeOf = (id) => (id ? grades[id] ?? {} : {});
  const rows = pff?.depthChart ?? [];
  const pffSlotsOf = (pffId) => rows.filter((r) => r.pffId === pffId).map((r) => `${r.alignment}${r.depthOrder}`);
  const whereOurs = (id) => {
    if (!id) return 'not on your roster';
    const p = byId[id];
    if (p.status !== 'active') return `your status: ${STATUS_LABELS[p.status].toLowerCase()}`;
    const s = depthSlots(roster, id).filter((x) => !/^(PT|PK|LS|H|KO|PR|KR)\d/.test(x));
    return s.length ? `yours: ${s.join(', ')}` : 'not on your depth chart';
  };

  const mapped = new Set(Object.values(SLOT_MAP).flat());
  const units = [];
  for (const [key, label] of [['offense', 'Offense'], ['defense', 'Defense']]) {
    const out = [];
    for (const slot of roster.depthChart[key] ?? []) {
      const alignments = SLOT_MAP[slot.slot] ?? [];
      const theirs = rows
        .filter((r) => alignments.includes(r.alignment))
        .sort((a, b) => a.depthOrder - b.depthOrder || alignments.indexOf(a.alignment) - alignments.indexOf(b.alignment));
      out.push(compareSlot(slot.slot, alignments, slot.players, theirs));
    }
    // PFF slots with no counterpart on ours (e.g. SLB in PFF's 4-3 view).
    const pffOnly = [...new Set(rows.filter((r) => r.unit === key && !mapped.has(r.alignment)).map((r) => r.alignment))];
    for (const a of pffOnly) {
      const theirs = rows.filter((r) => r.alignment === a).sort((x, y) => x.depthOrder - y.depthOrder);
      const row = compareSlot(a, [a], [], theirs);
      row.pffOnly = true;
      out.push(row);
    }
    units.push({ key, label, rows: out });
  }

  function compareSlot(slot, alignments, ourIds, theirs) {
    const ours = ourIds.map((id) => {
      const g = gradeOf(id);
      return { key: id, ourId: id, name: byId[id]?.name ?? id, grade: g.grade, gradeLabel: g.label, mode: g.mode, snaps: g.snaps ?? null };
    });
    const theirsN = theirs.map((r) => {
      const g = r.ourId ? gradeOf(r.ourId) : { grade: r.grade, mode: 'season' };
      return { key: r.pffId, ourId: r.ourId, pffId: r.pffId, name: r.name, slot: `${r.alignment}${r.depthOrder}`, grade: g.grade, gradeLabel: g.label, mode: g.mode, snaps: g.snaps ?? (r.ourId ? null : r.snaps) };
    });
    const flags = [];
    if (alignments.length && ours.length) {
      const starters = theirs.filter((r) => r.depthOrder === 1).map((r) => r.ourId);
      const ourStarters = ourIds.slice(0, Math.max(1, starters.length));
      const sameStarters = starters.length === ourStarters.length && starters.every((id) => ourStarters.includes(id));
      if (theirs.length && !sameStarters) {
        flags.push({ kind: 'starter', text: `Different starter: you have ${ourStarters.map((id) => byId[id]?.name).join(' & ')}, PFF has ${theirs.filter((r) => r.depthOrder === 1).map((r) => r.name).join(' & ')}.` });
      } else if (theirs.length && ourIds.join() !== theirs.map((r) => r.ourId).join()) {
        const shared = ourIds.filter((id) => theirs.some((r) => r.ourId === id));
        const pffOrder = theirs.map((r) => r.ourId).filter((id) => shared.includes(id));
        if (shared.join() !== pffOrder.join()) flags.push({ kind: 'order', text: 'Same starters, but a different order.' });
      }
    }
    for (const r of theirs) {
      if (!ourIds.includes(r.ourId)) flags.push({ kind: 'missing', text: `PFF lists ${r.name} here (${r.alignment}${r.depthOrder}) — ${whereOurs(r.ourId)}.` });
    }
    if (alignments.length) {
      for (const id of ourIds) {
        if (!theirs.some((r) => r.ourId === id)) {
          const pid = pff?.players?.[id]?.pffId;
          const s = pid ? pffSlotsOf(pid) : [];
          flags.push({ kind: 'extra', text: `${byId[id]?.name} is here on yours — PFF: ${s.length ? s.join(', ') : 'not on its depth chart'}.` });
        }
      }
    }
    const starter = ours[0];
    if (starter?.grade != null) {
      for (const b of ours.slice(1)) {
        if (b.grade != null && b.grade >= starter.grade + GRADE_GAP) {
          flags.push({ kind: 'grade', text: `${b.name} (${b.grade.toFixed(1)}) outgrades your starter ${starter.name} (${starter.grade.toFixed(1)}).` });
        }
      }
    }
    return { slot, alignments, ours, theirs: theirsN, flags };
  }

  const activeIds = new Set(roster.players.filter((p) => p.status === 'active').map((p) => p.id));
  const seen = new Set();
  const statusConflicts = rows
    .filter((r) => !activeIds.has(r.ourId) && !seen.has(r.pffId) && seen.add(r.pffId))
    .map((r) => ({ ...r, ourStatus: r.ourId ? STATUS_LABELS[byId[r.ourId].status] : 'not on your roster' }));

  return { units, statusConflicts };
}
