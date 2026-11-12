import { GRADE_MODES, gradeBand } from '../lib.js';

// A PFF grade chip. `mode` adds the career mark (C = NFL career,
// C+ = NFL + college, P = preseason). `kind` colours preseason and college
// grades apart from NFL regular-season ones; it defaults from the mode.
// Pass `snaps` to show the snap count the grade is built on underneath.
export default function Grade({ value, rank, of, title, mode, kind, snaps }) {
  const mark = GRADE_MODES[mode]?.mark;
  const k = kind ?? (mode === 'pre' ? 'pre' : mode === 'all' ? 'college' : null);
  const cls = ['grade', value == null ? 'none' : gradeBand(value), k].filter(Boolean).join(' ');
  const tip = [title ?? (value == null ? 'No PFF grade' : null), rank ? `Rank ${rank} of ${of}` : null].filter(Boolean).join(' · ');
  const chip = (
    <span className={cls} title={tip}>
      {value == null ? '—' : value.toFixed(1)}
      {mark && <span className="grade-mark" aria-label={GRADE_MODES[mode].label}>{mark}</span>}
    </span>
  );
  if (snaps === undefined) return chip;
  return (
    <span className="grade-stack">
      {chip}
      {snaps > 0 && <span className="snaps">{snaps.toLocaleString()} snaps</span>}
    </span>
  );
}
