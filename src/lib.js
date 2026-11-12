export const STATUS_LABELS = {
  active: 'Active (53)',
  practice_squad: 'Practice squad',
  injured_reserve: 'Injured reserve',
  pup: 'PUP',
  nfi: 'Non-football injury',
  suspended: 'Suspended',
  exempt: 'Exempt',
  free_agent: 'Free-agent target',
};
export const STATUSES = Object.keys(STATUS_LABELS);
export const RESERVE_STATUSES = ['injured_reserve', 'pup', 'nfi', 'suspended', 'exempt'];

export const UNITS = [
  { key: 'offense', label: 'Offense' },
  { key: 'defense', label: 'Defense' },
  { key: 'specialTeams', label: 'Special teams' },
];

export const TAGS = {
  draft: '2026 draft pick',
  udfa: '2026 undrafted rookie',
  new: 'New for 2026',
};

// Ourlads availability codes.
export const AVAILABILITY = {
  P: 'Probable', Q: 'Questionable', D: 'Doubtful', O: 'Out', GTD: 'Game-time decision',
  IA: 'Inactive', IR: 'Injured reserve', PUP: 'Physically unable to perform',
  NFI: 'Non-football injury/illness', SUS: 'Suspended', ILL: 'Illness', NIR: 'Not injury related',
  DNP: 'Did not participate', LP: 'Limited participation', FP: 'Full participation', REST: 'Veteran rest day',
};

export const POSITIONS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'ED', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS'];

// Ourlads acquisition codes, e.g. "24/1", "CF25", "U/Phi", "T/KC".
export function describeAcquisition(code) {
  if (!code) return '';
  let m;
  if ((m = code.match(/^(\d{2})\/(\d+)$/))) return `Drafted 20${m[1]}, round ${m[2]}`;
  if ((m = code.match(/^CF(\d{2})$/))) return `Undrafted free agent, 20${m[1]}`;
  if ((m = code.match(/^SF(\d{2})$/))) return `Street free agent, 20${m[1]}`;
  if ((m = code.match(/^U\/(\w+)$/))) return `Unrestricted free agent from ${m[1].toUpperCase()}`;
  if ((m = code.match(/^T\/(\w+)$/))) return `Trade from ${m[1].toUpperCase()}`;
  if ((m = code.match(/^W\/(\w+)$/))) return `Waiver claim from ${m[1].toUpperCase()}`;
  return code;
}

export function formatHeight(h) {
  if (!h) return '';
  return `${Math.floor(h / 100)}'${h % 100}"`;
}

export function age(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

// PFF's grade bands.
export function gradeBand(g) {
  if (g == null) return 'none';
  if (g >= 90) return 'elite';
  if (g >= 80) return 'high';
  if (g >= 70) return 'good';
  if (g >= 60) return 'avg';
  if (g >= 50) return 'below';
  return 'poor';
}

// The one grade and snap count to headline for a player.
export function headline(pff, player) {
  if (!pff) return { grade: null, snaps: null };
  const { depth, offense, defense, specialTeams: st } = pff;
  if (depth?.grade != null) return { grade: depth.grade, rank: depth.gradeRank, of: depth.gradeRankOf, snaps: depth.snaps, label: `${depth.unit[0].toUpperCase()}${depth.unit.slice(1)} grade` };
  const pos = player?.position;
  if (st && pos === 'P' && st.gradesPunter != null) return { grade: st.gradesPunter, snaps: st.totalSnaps, label: 'Punting grade' };
  if (st && pos === 'K' && st.gradesFgepKicker != null) return { grade: st.gradesFgepKicker, snaps: st.totalSnaps, label: 'FG/XP grade' };
  if (st && pos === 'LS' && st.gradesLongSnap != null) return { grade: st.gradesLongSnap, snaps: st.totalSnaps, label: 'Long-snap grade' };
  if (offense?.gradesOffense != null) return { grade: offense.gradesOffense, snaps: offense.snapCountsTotal, label: 'Offense grade' };
  if (defense?.gradesDefense != null) return { grade: defense.gradesDefense, snaps: defense.snapCountsDefense, label: 'Defense grade' };
  if (st?.gradesMiscSt != null) return { grade: st.gradesMiscSt, snaps: st.totalSnaps, label: 'Special-teams grade' };
  return { grade: null, snaps: null };
}

export function slugify(name) {
  return name.toLowerCase().replace(/['.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Where a player sits on our (managed) depth chart, e.g. ["QB1", "H1"].
export function depthSlots(roster, id) {
  const out = [];
  for (const { key } of UNITS) {
    for (const s of roster.depthChart[key] ?? []) {
      const i = s.players.indexOf(id);
      if (i >= 0) out.push(`${s.slot}${i + 1}`);
    }
  }
  return out;
}

// Change a player's roster status. Anyone leaving the active roster comes
// off the depth chart; putting someone on the depth chart makes them active.
export function setStatus(roster, id, status) {
  const next = { ...roster, players: roster.players.map((p) => (p.id === id ? { ...p, status } : p)) };
  return status === 'active' ? next : removeFromDepth(next, id);
}

// Quick roster moves offered for each status: [target status, button label].
export function rosterMoves(status) {
  const all = {
    active: [['practice_squad', 'Move to practice squad'], ['injured_reserve', 'Place on IR'], ['free_agent', 'Release to free-agent list']],
    practice_squad: [['active', 'Promote to active roster'], ['injured_reserve', 'Place on IR'], ['free_agent', 'Release to free-agent list']],
    injured_reserve: [['active', 'Activate to roster'], ['practice_squad', 'Move to practice squad'], ['free_agent', 'Release to free-agent list']],
    free_agent: [['active', 'Sign to active roster'], ['practice_squad', 'Sign to practice squad']],
  };
  return all[status] ?? [['active', 'Move to active roster'], ['practice_squad', 'Move to practice squad']];
}

export function removeFromDepth(roster, id) {
  const depthChart = {};
  for (const [k, slots] of Object.entries(roster.depthChart)) {
    depthChart[k] = slots.map((s) => ({ ...s, players: s.players.filter((p) => p !== id) }));
  }
  return { ...roster, depthChart };
}

// ---- Grade modes: this season vs snap-weighted career averages ----

export const GRADE_MODES = {
  season: { label: 'This season', short: 'Season', mark: '' },
  nfl: { label: 'NFL career', short: 'NFL', mark: 'C' },
  all: { label: 'NFL + college', short: 'NFL+Col', mark: 'C+' },
  pre: { label: 'NFL preseason', short: 'Pre', mark: 'P' },
};

// Which career seasons each mode averages. NFL seasons are regular season +
// playoffs ('reg') or preseason ('pre'); college seasons are all 'reg'.
const IN_MODE = {
  nfl: (s) => s.league === 'nfl' && s.phase !== 'pre',
  all: (s) => s.phase !== 'pre',
  pre: (s) => s.league === 'nfl' && s.phase === 'pre',
};

// Snap-weighted average grade across seasons: Σ(grade × snaps) / Σ snaps.
export function careerGrade(career, mode) {
  if (!career) return { grade: null, snaps: null, missing: true };
  const rows = career.seasons.filter((s) => IN_MODE[mode](s) && s.grade != null && s.snaps > 0);
  const snaps = rows.reduce((t, s) => t + s.snaps, 0);
  if (!snaps) return { grade: null, snaps: 0, label: `${GRADE_MODES[mode].label}: no graded snaps` };
  const grade = rows.reduce((t, s) => t + s.grade * s.snaps, 0) / snaps;
  const years = rows.map((s) => s.season);
  const span = `${Math.min(...years)}–${Math.max(...years)}`;
  return {
    grade, snaps, seasons: rows.length,
    label: `${GRADE_MODES[mode].label} ${career.gradeLabel.toLowerCase()}: ${snaps.toLocaleString()} snaps, ${rows.length} seasons (${span})`,
  };
}

// The grade to display for one player under a mode. Players who aren't on
// the Bears (free-agent targets) have no Bears report rows, so their season
// grade comes from their career row for the current NFL season.
export function gradeFor(mode, player, pffPlayer, career, season) {
  if (mode === 'season') {
    const h = headline(pffPlayer, player);
    if (h.grade == null && career && season) {
      const row = career.seasons.find((s) => s.league === 'nfl' && s.phase !== 'pre' && s.season === season);
      if (row?.grade != null) {
        return { grade: row.grade, snaps: row.snaps, mode, label: `${season} ${career.gradeLabel.toLowerCase()} (${row.teams.join('/') || 'NFL'})` };
      }
    }
    return { ...h, mode };
  }
  return { ...careerGrade(career, mode), mode };
}

// Per-viewer preferences; storage can be unavailable, so never let it throw.
export function loadPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function savePref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
