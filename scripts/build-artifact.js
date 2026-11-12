// Build the app as one self-contained page for a claude.ai artifact:
// the Vite bundle inlined, plus a snapshot of the roster, PFF data,
// team reports and career history. Roster edits made in the artifact
// are saved to the artifact's database, not to this repo.
//
// Output: dist/artifact.html (git-ignored: it contains licensed PFF data).
import { execSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, readRoster } from '../server/store.js';
import { loadPffData, loadPlayerReports } from '../server/pff.js';
import { readCareer } from '../server/career.js';
import { loadContracts } from '../server/contracts.js';

execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });

const dist = path.join(ROOT, 'dist');
const assets = await readdir(path.join(dist, 'assets'));
const css = await readFile(path.join(dist, 'assets', assets.find((f) => f.endsWith('.css'))), 'utf8');
const js = await readFile(path.join(dist, 'assets', assets.find((f) => f.endsWith('.js'))), 'utf8');

const roster = await readRoster();
const pff = await loadPffData(roster);
const careers = {};
const reports = {};
for (const p of roster.players) {
  const c = await readCareer(p.id);
  if (c) careers[p.id] = c;
  const r = await loadPlayerReports(roster, p.id);
  if (r?.reports.length) reports[p.id] = r;
}
const contracts = await loadContracts();
const snapshot = { builtAt: new Date().toISOString(), roster, pff, careers, reports, contracts };

// Keep "</script" sequences from closing the inline tags early.
const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1');

const html = `<title>Bears Roster Manager</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<script type="application/json" id="pff-snapshot">${safe(JSON.stringify(snapshot))}</script>
<script type="module">
${safe(js)}
</script>
`;
const out = path.join(dist, 'artifact.html');
await writeFile(out, html);
console.log(`Wrote ${path.relative(ROOT, out)} (${(html.length / 1024 / 1024).toFixed(2)} MB): ${roster.players.length} players, ${Object.keys(careers).length} careers, ${Object.keys(reports).length} with reports.`);
