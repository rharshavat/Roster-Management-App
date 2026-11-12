import { gradeBand } from '../lib.js';

export default function Grade({ value, rank, of, title }) {
  if (value == null) return <span className="grade none" title="No PFF grade">—</span>;
  const tip = [title, rank ? `Rank ${rank} of ${of}` : null].filter(Boolean).join(' · ');
  return <span className={`grade ${gradeBand(value)}`} title={tip}>{value.toFixed(1)}</span>;
}
