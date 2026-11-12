// Look up players new to the roster (e.g. prospective free agents) in the
// PFF directory and fetch their career history, without a full team sync.
// Usage: npm run sync:players
import path from 'node:path';
import { ROOT, readRoster } from '../server/store.js';

try { process.loadEnvFile(path.join(ROOT, '.env')); } catch {}
const { resolveNewPlayers } = await import('../server/pff.js');
const { syncCareers } = await import('../server/career.js');
const { syncContracts } = await import('../server/contracts.js');

const roster = await readRoster();
await resolveNewPlayers(roster);
const r = await syncCareers(roster, { log: console.log });
await syncContracts(roster);
console.log(`Careers: fetched ${r.fetched}, up to date ${r.upToDate}.${r.failed.length ? ` Failed: ${r.failed.join('; ')}` : ''}`);
