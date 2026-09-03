import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { parseTff, parseTffWeek, plain } from '../lib/tff.mjs';
import { canonicalTeam } from '../lib/data.mjs';

const root = resolve(import.meta.dirname, '..');
const cacheDir = resolve(root, 'data/research/tff');
const destination = resolve(root, 'data/normalized');
const refresh = process.argv.includes('--refresh');
const currentOnly = process.argv.includes('--current-only');
const historyOnly = process.argv.includes('--history-only');
await mkdir(cacheDir, { recursive: true });
await mkdir(destination, { recursive: true });

async function download(url, name, force = false) {
  const path = resolve(cacheDir, name + '.html');
  if (!force) {
    try { return await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Sertifika kontrolü açık kalır; erişim reddi veya hız sınırında toplama durur.
  await delay(400);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'PTnextResearch/0.1' } });
  if (!response.ok) throw new Error(`TFF HTTP ${response.status}: ${url}`);
  const html = new TextDecoder('windows-1254').decode(await response.arrayBuffer());
  if (!html.includes('haftaninMaclari') && !html.includes('fiksturListesiTable') && !(name === 'archive' && /\d{4}-\d{4}/.test(plain(html)))) throw new Error('TFF beklenen sayfa yerine farklı içerik döndürdü.');
  await writeFile(path + '.tmp', html);
  await rename(path + '.tmp', path);
  await writeFile(resolve(cacheDir, name + '.source.json'), JSON.stringify({ url, retrievedAt: new Date().toISOString(), sha256: createHash('sha256').update(html).digest('hex') }, null, 2));
  return html;
}

for (const [name, page] of [['2024-25', 1730], ['2025-26', 1768], ['current', 198]]) {
  if (historyOnly) continue;
  if (currentOnly && name !== 'current') continue;
  const url = `https://www.tff.org/default.aspx?pageID=${page}`;
  const html = await download(url, name, refresh);
  const data = parseTff(html);
  const nextRound = Math.min(...data.fixtures.filter(m => m.homeGoals === null).map(m => m.round));
  const seasonLastRound = Math.max(...data.fixtures.map(m => m.round));
  const completedRound = Math.max(0, ...data.fixtures.filter(m => m.homeGoals !== null).map(m => m.round));
  const lastRound = name === 'current' ? Math.min(seasonLastRound, Math.max(Number.isFinite(nextRound) ? nextRound : seasonLastRound, completedRound) + 1) : seasonLastRound;
  for (let week = 1; week <= lastRound; week++) {
    const pageHtml = await download(`${url}&hafta=${week}`, `${name}-week-${week}`, refresh && name === 'current');
    const dates = parseTffWeek(pageHtml);
    for (const date of dates) {
      const match = data.fixtures.find(m => m.id === date.id);
      if (match) Object.assign(match, date);
    }
    if (week % 10 === 0) console.log(`${data.season}: ${week}. haftaya kadar tarihler alındı.`);
  }
  const missingDates = data.fixtures.filter(m => m.homeGoals !== null && !m.date);
  if (missingDates.length) throw new Error(`${data.season}: oynanmış ${missingDates.length} maçın tarihi yok; eski veri korunuyor.`);
  const metadata = JSON.parse(await readFile(resolve(cacheDir, name + '.source.json'), 'utf8'));
  const output = { ...data, source: url, retrievedAt: metadata.retrievedAt, importedAt: new Date().toISOString() };
  const path = resolve(destination, data.season + '.json');
  await writeFile(path + '.tmp', JSON.stringify(output, null, 2));
  await rename(path + '.tmp', path);
  console.log(`${data.season}: ${data.fixtures.length} fikstür, ${data.fixtures.filter(m => m.homeGoals !== null).length} sonuç, ${data.standings.length} takım.`);
}

// Haftalık arşiv cetveli okunur; sezon sonu tablosundan geçmiş sıra türetilmez.
const current = parseTff(await readFile(resolve(cacheDir, 'current.html'), 'utf8'));
const startYear = Number(current.season.slice(0, 4));
const archiveUrl = 'https://www.tff.org/default.aspx?pageID=545';
const seasonLinks = html => new Map([...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
  .map(m => [plain(m[2]), m[1].replace(/^http:/, 'https:')]));
let links = seasonLinks(await download(archiveUrl, 'archive'));
if (!links.has(`${startYear - 1}-${startYear}`)) links = seasonLinks(await download(archiveUrl, 'archive', true));
// Sponsor adı değişse de TFF kulüp kimliği aynı takımı eşleştirir.
const names = new Map(current.fixtures.flatMap(m => [[m.homeId, canonicalTeam(m.home)], [m.awayId, canonicalTeam(m.away)]]));
const history = { currentSeason: current.season, seasons: [] };
for (let offset = 1; offset <= 10; offset++) {
  const year = startYear - offset;
  const season = `${year}-${year + 1}`;
  const source = links.get(season);
  if (!source || new URL(source).hostname !== 'www.tff.org') throw new Error(`${season}: TFF arşiv bağlantısı doğrulanamadı.`);
  const entry = { season, teams: [], weeks: {} };
  for (let week = 1; week <= (entry.maxRound || 1); week++) {
    const name = `${year}-${String(year + 1).slice(2)}-week-${week}`;
    const html = await download(`${source}&hafta=${week}`, name);
    const parsed = parseTff(html);
    const maxWeek = Math.max(...parsed.fixtures.map(m => m.round));
    entry.maxRound = maxWeek;
    const ids = new Map(parsed.fixtures.flatMap(m => [[m.home, m.homeId], [m.away, m.awayId]]));
    for (const [name, id] of ids) if (!names.has(id)) names.set(id, canonicalTeam(name));
    entry.teams = [...new Set(ids.values())].map(id => names.get(id));
    if (week > maxWeek) continue;
    const selectedWeek = html.match(/class="aspNetDisabled TRcolor"[^>]*>[\s\S]*?class="innerWrap">(\d+)\.Hafta/);
    if (parsed.season !== season || Number(selectedWeek?.[1]) !== week || parsed.standings.some(r => r.played > week)) {
      throw new Error(`${season} / ${week}. hafta: arşiv cetveli istenen haftayla uyuşmuyor.`);
    }
    const rows = parsed.standings.map(r => {
      const teamId = r.teamId;
      if (!teamId || r.played !== r.won + r.drawn + r.lost || r.points > 3 * r.played) throw new Error(`${season}: geçersiz arşiv satırı.`);
      return { rank: r.rank, team: names.get(teamId), teamId, played: r.played, points: r.points };
    });
    if (new Set(rows.map(r => r.teamId)).size !== rows.length || rows.some((r, i) => r.rank !== i + 1)) throw new Error(`${season}: arşiv sıralaması eksik veya yinelenmiş.`);
    const metadata = JSON.parse(await readFile(resolve(cacheDir, name + '.source.json'), 'utf8'));
    entry.teams = rows.map(r => r.team);
    entry.weeks[week] = { rows, source: `${source}&hafta=${week}`, retrievedAt: metadata.retrievedAt, sha256: metadata.sha256 };
    if (week % 10 === 0) console.log(`${season}: ${week}. hafta arşivi hazır.`);
  }
  history.seasons.push(entry);
  console.log(`${season}: ${Object.keys(entry.weeks).join(', ')}. hafta cetvelleri doğrulandı.`);
}
const historyPath = resolve(root, 'data/standings-history.json');
await writeFile(historyPath + '.tmp', JSON.stringify(history));
await rename(historyPath + '.tmp', historyPath);
