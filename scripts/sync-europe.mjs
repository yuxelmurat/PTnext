import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parseEuropeanMatches } from '../lib/europe.mjs';

const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, 'data/research/europe');
await mkdir(directory, { recursive: true });
const output = { seasons: [], competitions: ['Şampiyonlar Ligi', 'Avrupa Ligi', 'Konferans Ligi'],
  scope: '2020–2025 ana turnuvaları; elemeler dahil değil.', matches: [], sources: [] };
for (let year = 2020; year <= 2024; year++) {
  const season = `${year}-${year + 1}`;
  output.seasons.push(season);
  for (const competition of year === 2020 ? ['cl', 'el'] : ['cl', 'el', 'conf']) {
    const url = `https://raw.githubusercontent.com/openfootball/champions-league/master/${year}-${String(year + 1).slice(2)}/${competition}.txt`;
    const path = resolve(directory, `${season}-${competition}.txt`);
    let body, metadata;
    try { body = await readFile(path, 'utf8'); metadata = JSON.parse(await readFile(path + '.source.json', 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await delay(400);
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Avrupa arşivi HTTP ${response.status}`);
      body = await response.text();
      if (!body.startsWith('= UEFA')) throw new Error('Avrupa arşivi biçimi değişti.');
      metadata = { url, retrievedAt: new Date().toISOString(), sha256: createHash('sha256').update(body).digest('hex') };
      await writeFile(path, body); await writeFile(path + '.source.json', JSON.stringify(metadata));
    }
    const rows = parseEuropeanMatches(body, season, competition, url);
    output.matches.push(...rows); output.sources.push(metadata);
  }
}
if (new Set(output.matches.map(m => `${m.team}:${m.date}`)).size !== output.matches.length) throw new Error('Avrupa arşivinde yinelenen maç var.');
const path = resolve(root, 'data/europe.json');
await writeFile(path + '.tmp', JSON.stringify(output)); await rename(path + '.tmp', path);
console.log(`${output.seasons.length} sezon, ${output.matches.length} Türk takımı Avrupa maçı; ana turnuvalar.`);
