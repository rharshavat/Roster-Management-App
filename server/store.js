import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROSTER_FILE = path.join(ROOT, 'data', 'bears-roster.json');
export const CACHE_DIR = path.join(ROOT, 'data', 'pff-cache');

export const STATUSES = ['active', 'practice_squad', 'injured_reserve', 'pup', 'nfi', 'suspended', 'exempt', 'free_agent'];

export async function readRoster() {
  return JSON.parse(await readFile(ROSTER_FILE, 'utf8'));
}

export function validateRoster(doc) {
  const errors = [];
  if (!doc || !Array.isArray(doc.players) || !doc.depthChart) return ['Roster must have players and depthChart.'];
  const ids = new Set();
  for (const p of doc.players) {
    if (!p.id || !p.name) errors.push(`Player missing id or name: ${JSON.stringify(p)}`);
    if (ids.has(p.id)) errors.push(`Duplicate player id: ${p.id}`);
    ids.add(p.id);
    if (!STATUSES.includes(p.status)) errors.push(`${p.name}: unknown status "${p.status}"`);
  }
  for (const [unit, slots] of Object.entries(doc.depthChart)) {
    for (const s of slots) for (const id of s.players) {
      if (!ids.has(id)) errors.push(`${unit} ${s.slot}: unknown player "${id}"`);
    }
  }
  return errors;
}

// Atomic write so a crash mid-save never leaves a half-written roster.
export async function writeRoster(doc) {
  const tmp = `${ROSTER_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(doc, null, 2) + '\n');
  await rename(tmp, ROSTER_FILE);
}
