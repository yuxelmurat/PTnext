import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { loadData } from '../lib/data.mjs';
import { parseLineup } from '../lib/squad.mjs';

const root = resolve(import.meta.dirname, '..'), path = resolve(root, 'data/squads.json');
const { matches, current } = await loadData(root);
const history = process.argv.includes('--history');
let database = { schemaVersion: 1, records: {}, unavailable: {} };
try { database = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(resolve(root, 'data/research/squads'), { recursive: true });
const candidates = matches.filter(m => !m.excluded && (history ? m.season >= '2024-2025' : m.season === current.season) && !database.records[m.id]);
let completed = 0;
for (const match of candidates) {
  const cache = resolve(root, `data/research/squads/${match.id}.html`);
  let html;
  try { html = await readFile(cache, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!html) {
    await delay(100);
    const response = await fetch(match.source, { headers: { 'User-Agent': 'PTnextResearch/0.3' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Kadro kaynağı HTTP ${response.status}: ${match.id}`);
    html = new TextDecoder('windows-1254').decode(await response.arrayBuffer());
  }
  const record = parseLineup(html, match);
  if (record) {
    database.records[match.id] = { ...record, retrievedAt: new Date().toISOString(), sha256: createHash('sha256').update(html).digest('hex') };
    await writeFile(cache, html);
    delete database.unavailable[match.id];
  } else database.unavailable[match.id] = { source: match.source, checkedAt: new Date().toISOString() };
  completed++;
  if (completed % 50 === 0) console.log(`Kadro arşivi: ${completed}/${candidates.length}`);
}
database.updatedAt = new Date().toISOString();
await writeFile(path + '.tmp', JSON.stringify(database));
await rename(path + '.tmp', path);
console.log(`Kadro arşivi: ${Object.keys(database.records).length} doğrulanmış maç, ${Object.keys(database.unavailable).length} eksik kadro.`);
