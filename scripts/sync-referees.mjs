import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { loadData } from '../lib/data.mjs';
import { parseReferee } from '../lib/tff.mjs';

const root = resolve(import.meta.dirname, '..');
const path = resolve(root, 'data/referees.json');
const { seasons, current } = await loadData(root);
const historical = process.argv.includes('--history');
const nextRound = Math.min(...current.fixtures.filter(m => m.homeGoals === null).map(m => m.round));
const relevant = seasons.flatMap(s => s.fixtures).filter(m => m.homeGoals !== null || (m.season === current.season && m.round === nextRound));
let database = { records: {} };
try { database = JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const candidates = relevant.filter(m => {
  const previous = database.records[m.id];
  if (m.homeGoals === null) return true;
  if (!historical && m.season !== current.season) return false;
  return !previous?.referee;
}).sort((a, b) => b.season.localeCompare(a.season) || b.round - a.round);
await mkdir(resolve(root, 'data/research/referees'), { recursive: true });
async function save() {
  database.updatedAt = new Date().toISOString();
  await writeFile(path + '.tmp', JSON.stringify(database, null, 2));
  await rename(path + '.tmp', path);
}
let done = 0;
for (const match of candidates) {
  await delay(300);
  const response = await fetch(match.source, { headers: { 'User-Agent': 'PTnextResearch/0.2' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) { await save(); throw new Error(`Hakem kaynağı HTTP ${response.status}: ${match.id}`); }
  const html = new TextDecoder('windows-1254').decode(await response.arrayBuffer());
  const record = parseReferee(html, match);
  database.records[match.id] = { ...record, source: match.source, retrievedAt: new Date().toISOString(),
    sha256: createHash('sha256').update(html).digest('hex') };
  done++;
  if (done % 25 === 0) { await save(); console.log(`Hakem arşivi: ${done}/${candidates.length} kayıt kontrol edildi.`); }
}
await save();
console.log(`Hakem verisi hazır: ${Object.values(database.records).filter(r => r.referee).length} atama, ${done} sayfa kontrolü.`);
