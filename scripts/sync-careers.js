// Fetch NFL + college career history for every rostered player.
// Usage: npm run sync:careers [-- --force]
import path from 'node:path';
import { ROOT, readRoster } from '../server/store.js';

try { process.loadEnvFile(path.join(ROOT, '.env')); } catch {}
const { syncCareers } = await import('../server/career.js');

const r = await syncCareers(await readRoster(), { force: process.argv.includes('--force'), log: console.log });
console.log(`Fetched ${r.fetched}, already up to date ${r.upToDate}, of ${r.requested} players.`);
if (r.failed.length) {
  console.log(`Failed:\n  ${r.failed.join('\n  ')}`);
  process.exitCode = 1;
}
