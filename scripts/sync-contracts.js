// Download nflverse/OverTheCap contracts and match them to the roster.
// Usage: npm run sync:contracts
import path from 'node:path';
import { ROOT, readRoster } from '../server/store.js';

try { process.loadEnvFile(path.join(ROOT, '.env')); } catch {}
const { syncContracts } = await import('../server/contracts.js');

try {
  await syncContracts(await readRoster());
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
