import { GRADE_MODES, gradeBand } from '../lib.js';

// `mode` marks career-based grades (C = NFL career, C+ = NFL + college).
export default function Grade({ value, rank, of, title, mode }) {
  const mark = GRADE_MODES[mode]?.mark;
  if (value == null) return <span className="grade none" title={title ?? 'No PFF grade'}>—{mark && <sup>{mark}</sup>}</span>;
  const tip = [title, rank ? `Rank ${rank} of ${of}` : null].filter(Boolean).join(' · ');
  return (
    <span className={`grade ${gradeBand(value)}${mark ? ' career' : ''}`} title={tip}>
      {value.toFixed(1)}{mark && <sup>{mark}</sup>}
    </span>
  );
}
