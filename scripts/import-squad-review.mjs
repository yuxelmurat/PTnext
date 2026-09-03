import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { validateSquadReview } from '../lib/squad.mjs';
import { plain } from '../lib/tff.mjs';
import { loadData } from '../lib/data.mjs';

const root = resolve(import.meta.dirname, '..');
const candidatePath = resolve(root, process.argv[2] || 'data/squad-review.next.json');
const rel = relative(root, candidatePath);
if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Kadro inceleme dosyası proje içinde olmalı.');
const { current } = await loadData(root);
const candidate = validateSquadReview(JSON.parse(await readFile(candidatePath, 'utf8')), current.fixtures);
const evidenceCache = new Map();
const normalize = text => plain(text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')).normalize('NFKC').toLocaleLowerCase('tr-TR');
const official = new Set(['www.tff.org', 'tff.org', 'www.galatasaray.org', 'galatasaray.org', 'www.fenerbahce.org', 'fenerbahce.org', 'www.bjk.com.tr', 'bjk.com.tr']);
// Diğer kulüplerin resmî alan adları TFF kulüp sayfasındaki web adresinden alınır.
const clubIds = new Map(current.standings.map(t => [t.team, t.teamId]));
async function get(url, redirects = 0) {
  const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'PTnextResearch/0.3' }, signal: AbortSignal.timeout(20000) });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const next = new URL(response.headers.get('location'), url);
    if (redirects >= 3 || next.protocol !== 'https:' || next.hostname.replace(/^www\./, '') !== new URL(url).hostname.replace(/^www\./, '')) throw new Error(`Kaynak yönlendirmesi doğrulanamadı: ${url}`);
    return get(next.href, redirects + 1);
  }
  if (!response.ok) throw new Error(`Kadro kanıt kaynağı HTTP ${response.status}: ${url}`);
  const bytes = await response.arrayBuffer();
  return new TextDecoder(/tff\.org$/.test(new URL(url).hostname) ? 'windows-1254' : 'utf-8').decode(bytes);
}
async function verify(url, quote, team) {
  const host = new URL(url).hostname;
  if (!official.has(host)) {
    const teamId = clubIds.get(team);
    if (!teamId) throw new Error(`${team}: TFF kulüp kimliği yok.`);
    const club = await get(`https://www.tff.org/Default.aspx?pageId=28&kulupId=${teamId}`);
    const domains = [...club.matchAll(/href="(https?:\/\/[^"\s]+)"/gi)].filter(m => /www\.[a-z0-9.-]+/.test(m[1])).map(m => new URL(m[1]).hostname);
    // Bağlantı metninin de web adresi olması, reklam ve sosyal medya bağlantılarını dışarıda tutar.
    const isClubAddress = [...club.matchAll(/<a\b[^>]*href="(https?:\/\/[^"\s]+)"[^>]*>([\s\S]*?)<\/a>/gi)].some(m => new URL(m[1]).hostname === host && /^(?:www\.)[a-z0-9.-]+\.[a-z]+\/?$/i.test(plain(m[2])));
    if (!domains.includes(host) || !isClubAddress) throw new Error(`${host}: takımın TFF kaydındaki resmî kaynak olarak doğrulanamadı.`);
    official.add(host);
  }
  let html = evidenceCache.get(url);
  if (!html) { html = await get(url); evidenceCache.set(url, html); }
  if (!normalize(html).includes(normalize(quote))) throw new Error(`${team}: haber alıntısı kaynakta bulunamadı.`);
  return createHash('sha256').update(html).digest('hex');
}
for (const team of candidate.teams.filter(t => t.status === 'reviewed')) {
  team.sourceHashes = await Promise.all(team.sources.map(source => verify(source, '', team.team)));
}
for (const event of candidate.events) {
  event.sourceHash = await verify(event.source, event.evidence, event.team);
  if (event.replacementId) event.replacementSourceHash = await verify(event.replacementSource, event.replacementEvidence, event.team);
}
candidate.importedAt = new Date().toISOString();
const text = JSON.stringify(candidate, null, 2);
await mkdir(resolve(root, 'data/squad-reviews'), { recursive: true });
const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
await writeFile(resolve(root, `data/squad-reviews/${hash}.json`), text, { flag: 'wx' });
const path = resolve(root, 'data/squad-review.json');
await writeFile(path + '.tmp', text);
await rename(path + '.tmp', path);
console.log(`${candidate.teams.length} takım incelendi, ${candidate.events.length} kaynaklı oyuncu durumu kaydedildi.`);
