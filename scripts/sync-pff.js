import path from 'node:path';
import { ROOT } from '../server/store.js';

try { process.loadEnvFile(path.join(ROOT, '.env')); } catch {}
const { syncPff } = await import('../server/pff.js');

try {
  await syncPff();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
