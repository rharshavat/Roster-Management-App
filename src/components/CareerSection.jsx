import { useEffect, useState } from 'react';
import Grade from './Grade.jsx';
import { GRADE_MODES, careerGrade } from '../lib.js';

// Stats shown per season, by what the player is graded on.
const COLUMNS = {
  QB: [['attempts', 'Att'], ['completions', 'Cmp'], ['yards', 'Yds'], ['touchdowns', 'TD'], ['interceptions', 'INT'], ['big_time_throws', 'BTT'], ['turnover_worthy_plays', 'TWP'], ['grades_pass', 'Pass']],
  RB: [['attempts', 'Att'], ['yards', 'Yds'], ['ypa', 'YPA'], ['touchdowns', 'TD'], ['avoided_tackles', 'Avoided tkl'], ['receptions', 'Rec'], ['rec_yards', 'Rec yds'], ['grades_run', 'Run']],
  WR: [['targets', 'Tgt'], ['receptions', 'Rec'], ['yards', 'Yds'], ['touchdowns', 'TD'], ['yprr', 'YPRR'], ['drops', 'Drops'], ['grades_pass_route', 'Route']],
  OL: [['snap_counts_pass_block', 'PB snaps'], ['pressures_allowed', 'Pressures'], ['sacks_allowed', 'Sacks'], ['pbe', 'PBE'], ['grades_pass_block', 'Pass blk'], ['grades_run_block', 'Run blk']],
  defense: [['tackles', 'Tkl'], ['stops', 'Stops'], ['sacks', 'Sacks'], ['total_pressures', 'Pressures'], ['interceptions', 'INT'], ['pass_break_ups', 'PBU'], ['grades_run_defense', 'Run D'], ['grades_pass_rush_defense', 'Rush'], ['grades_coverage_defense', 'Cov']],
  kicker: [['total_made', 'FGM'], ['total_attempts', 'FGA'], ['total_percent', 'FG%'], ['fifty_made', '50+'], ['pat_percent', 'XP%']],
  punter: [['attempts', 'Punts'], ['average_yards_per_attempt', 'Avg'], ['average_net_yards', 'Net'], ['inside_twenties', 'In 20'], ['average_hangtime', 'Hang']],
  longsnap: [['snap_counts_field_goal', 'FG snaps'], ['snap_counts_punt_coverage', 'Punt snaps'], ['grades_misc_st', 'ST grade']],
};
const columnsFor = (career, position) => {
  if (career.unit !== 'offense') return COLUMNS[career.unit];
  if (position === 'QB') return COLUMNS.QB;
  if (['RB', 'HB', 'FB'].includes(position)) return COLUMNS.RB;
  if (['WR', 'TE'].includes(position)) return COLUMNS.WR;
  return COLUMNS.OL;
};

const fmt = (v) => (v == null ? '' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(1) : v.toLocaleString());

export default function CareerSection({ player, seasonGrade, teamMode, override, onOverride, onCareerLoaded }) {
  const [state, setState] = useState({ loading: true });

  async function load(refresh = false) {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await fetch(`/api/players/${encodeURIComponent(player.id)}/career${refresh ? '?refresh=1' : ''}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setState({ data });
      onCareerLoaded?.(player.id, {
        unit: data.unit, gradeLabel: data.gradeLabel, fetchedAt: data.fetchedAt,
        seasons: data.seasons.map(({ league, phase, season, teams, snaps, grade }) => ({ league, phase, season, teams, snaps, grade })),
      });
    } catch (e) {
      setState({ error: e.message });
    }
  }

  useEffect(() => { load(); }, [player.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const career = state.data;
  const options = {
    season: seasonGrade,
    nfl: career ? careerGrade(career, 'nfl') : {},
    all: career ? careerGrade(career, 'all') : {},
    pre: career ? careerGrade(career, 'pre') : {},
  };
  const active = override ?? teamMode;

  return (
    <div className="career">
      <div className="mode-cards" role="radiogroup" aria-label="Grade shown for this player">
        {Object.entries(GRADE_MODES).map(([k, m]) => (
          <button key={k} role="radio" aria-checked={active === k} className={`mode-card${active === k ? ' active' : ''}`} onClick={() => onOverride(player.id, k === teamMode ? null : k)}>
            <span className="mode-card-label">{m.label}</span>
            <Grade value={options[k].grade} title={options[k].label} mode={k} />
            <span className="mode-card-sub">{options[k].snaps != null ? `${options[k].snaps.toLocaleString()} snaps` : ''}</span>
          </button>
        ))}
      </div>
      <p className="hint">
        Shown across the app: <b>{GRADE_MODES[active].label}</b>
        {override ? <> (set for this player · <button className="link" onClick={() => onOverride(player.id, null)}>use team setting</button>)</> : ' (team setting)'}.
        Career grades are averages weighted by snaps; NFL career excludes preseason.
      </p>

      {state.loading && <p className="hint">Loading career history…</p>}
      {state.error && <p className="msg error">{state.error} <button className="link" onClick={() => load(true)}>Retry</button></p>}
      {career && (career.seasons.length === 0 ? <p className="hint">PFF has no graded seasons for this player.</p> : (
        <CareerTable career={career} position={player.position} onRefresh={() => load(true)} />
      ))}
    </div>
  );
}

const GROUPS = [
  { key: 'nfl', label: 'NFL career', test: (s) => s.league === 'nfl' && s.phase !== 'pre' },
  { key: 'pre', label: 'NFL preseason', test: (s) => s.league === 'nfl' && s.phase === 'pre' },
  { key: 'ncaa', label: 'College', test: (s) => s.league === 'ncaa' },
];

function weighted(rows) {
  const graded = rows.filter((s) => s.grade != null && s.snaps > 0);
  const snaps = graded.reduce((t, s) => t + s.snaps, 0);
  return snaps ? graded.reduce((t, s) => t + s.grade * s.snaps, 0) / snaps : null;
}

function CareerTable({ career, position, onRefresh }) {
  const [showPre, setShowPre] = useState(false);
  const hasPre = career.seasons.some((s) => s.phase === 'pre');
  const seasons = career.seasons.filter((s) => showPre || s.phase !== 'pre');
  const cols = columnsFor(career, position).filter(([k]) => seasons.some((s) => s.stats[k] != null));
  const summary = GROUPS.filter((g) => g.key !== 'pre' || showPre).map((g) => {
    const rows = career.seasons.filter(g.test);
    if (!rows.length) return null;
    return { ...g, seasons: rows.length, snaps: rows.reduce((t, s) => t + s.snaps, 0), grade: weighted(rows) };
  }).filter(Boolean);

  return (
    <>
      {hasPre && (
        <label className="check small"><input type="checkbox" checked={showPre} onChange={(e) => setShowPre(e.target.checked)} /> Show preseason</label>
      )}
      <div className="table-wrap">
        <table className="career-table">
          <thead>
            <tr>
              <th>Season</th><th>Team</th><th className="num">Snaps</th><th>{career.gradeLabel}</th>
              {cols.map(([k, l]) => <th key={k} className="num">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {seasons.map((s) => (
              <tr key={`${s.league}-${s.phase}-${s.season}`} className={s.league === 'ncaa' ? 'college' : s.phase === 'pre' ? 'preseason' : ''}>
                <td>
                  {s.season}
                  {s.league === 'ncaa' && <span className="level"> College</span>}
                  {s.phase === 'pre' && <span className="level pre"> Preseason</span>}
                </td>
                <td>{s.teams.join(' / ')}</td>
                <td className="num">{s.snaps.toLocaleString()}</td>
                <td><Grade value={s.grade} /></td>
                {cols.map(([k]) => (
                  <td key={k} className="num">{k.startsWith('grades_') ? <Grade value={s.stats[k]} /> : fmt(s.stats[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {summary.map((t) => (
              <tr key={t.key}>
                <th>{t.label}</th>
                <td>{t.seasons} season{t.seasons > 1 ? 's' : ''}</td>
                <td className="num">{t.snaps.toLocaleString()}</td>
                <td><Grade value={t.grade} title="Weighted by snaps" /></td>
                <td colSpan={cols.length} />
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      <p className="hint">
        Fetched {new Date(career.fetchedAt).toLocaleString()} · <button className="link" onClick={onRefresh}>Refresh from PFF</button>
      </p>
    </>
  );
}
