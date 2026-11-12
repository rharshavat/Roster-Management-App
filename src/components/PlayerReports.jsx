import { useEffect, useState } from 'react';
import Grade from './Grade.jsx';
import { playerReports } from '../api.js';

// The stats worth seeing before "show all"; every grades* column is included too.
const KEY_STATS = [
  'war', 'waa', 'attempts', 'completions', 'completionPercent', 'yards', 'touchdowns', 'interceptions',
  'bigTimeThrows', 'turnoverWorthyPlays', 'bttRate', 'twpRate', 'accuracyPercent', 'avgDepthOfTarget',
  'avgTimeToThrow', 'qbRating', 'epa', 'sacks', 'pressureToSackRate', 'ypa', 'targets', 'receptions', 'recYards',
  'yprr', 'routes', 'drops', 'dropRate', 'yardsAfterCatch', 'contestedCatchRate', 'yardsAfterContact',
  'avoidedTackles', 'elusiveRating', 'explosive', 'breakawayPercent', 'firstDowns', 'pressuresAllowed',
  'sacksAllowed', 'hitsAllowed', 'hurriesAllowed', 'pbwr', 'truePassSetPbwr', 'totalPressures', 'hurries',
  'hits', 'passRushWinRate', 'prwr', 'stops', 'tackles', 'missedTackles', 'missedTackleRate', 'passBreakUps',
  'forcedIncompletes', 'qbRatingAgainst', 'yardsPerCoverageSnap', 'fieldGoalsMade', 'fieldGoalAttempts',
  'longest', 'average', 'averageNetDistance', 'averageHangTime', 'returns', 'kickoffs', 'touchbacks',
];
const KEY_SET = new Set(KEY_STATS);

// Headline grades first; penalty and fumble grades last.
const GRADE_ORDER = [
  'gradesOffense', 'gradesDefense', 'gradesPass', 'gradesRun', 'gradesPassRoute', 'gradesPassBlock',
  'gradesRunBlock', 'gradesPassRushDefense', 'gradesRunDefense', 'gradesCoverageDefense', 'gradesTackle',
  'gradesMiscSt', 'gradesKickReturn', 'gradesPuntReturn', 'gradesPunter', 'gradesFgepKicker', 'gradesKickoffKicker', 'gradesLongSnap',
];
const gradeRank = (k) => (GRADE_ORDER.includes(k) ? GRADE_ORDER.indexOf(k) : /penalty|fumble/i.test(k) ? 999 : 500);
const gradeLabel = (label) => label.replace(/^Grades?\s+/i, '').replace(/^./, (c) => c.toUpperCase());
const isKey = (k) => k.startsWith('grades') || KEY_SET.has(k);

function fmt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(Math.abs(v) < 10 ? 2 : 1);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

export default function PlayerReports({ playerId, syncedAt }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let live = true;
    setState({ loading: true });
    playerReports(playerId)
      .then((d) => live && setState({ data: d }))
      .catch((e) => live && setState({ error: e.message }));
    return () => { live = false; };
  }, [playerId, syncedAt]);

  if (state.loading) return <p className="hint">Loading PFF reports…</p>;
  if (state.error) return <p className="msg error">{state.error}</p>;
  const { reports } = state.data;
  if (!reports.length) return <p className="hint">No PFF report rows for this player this season (no snaps yet, or not synced).</p>;

  return (
    <div className="reports">
      {reports.map((r, i) => <Report key={r.key} report={r} defaultOpen={i === 0} />)}
    </div>
  );
}

function Report({ report, defaultOpen }) {
  const [all, setAll] = useState(false);
  const grades = report.columns.filter((c) => c.key.startsWith('grades')).sort((a, b) => gradeRank(a.key) - gradeRank(b.key));
  const others = report.columns.filter((c) => !c.key.startsWith('grades'));
  let key = others.filter((c) => isKey(c.key)).sort((a, b) => KEY_STATS.indexOf(a.key) - KEY_STATS.indexOf(b.key));
  if (key.length < 6) key = [...key, ...others.filter((c) => !key.includes(c)).slice(0, 10 - key.length)];
  const shown = all ? others : key;

  return (
    <details className="report" open={defaultOpen}>
      <summary>
        <span>{report.label}</span>
        <span className="report-grades">
          {grades[0] && <Grade value={report.values[grades[0].key]} title={gradeLabel(grades[0].label)} />}
        </span>
      </summary>
      {grades.length > 0 && (
        <dl className="stat-grid">
          {grades.map((c) => <div key={c.key}><dt>{gradeLabel(c.label)}</dt><dd><Grade value={report.values[c.key]} /></dd></div>)}
        </dl>
      )}
      <dl className="stat-grid">
        {shown.map((c) => <div key={c.key}><dt>{c.label}</dt><dd>{fmt(report.values[c.key])}</dd></div>)}
      </dl>
      {others.length > key.length && (
        <button className="link small" onClick={() => setAll((a) => !a)}>
          {all ? 'Show key stats only' : `Show all ${others.length} stats`}
        </button>
      )}
    </details>
  );
}
