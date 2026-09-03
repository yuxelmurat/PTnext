import { writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { plain } from '../lib/tff.mjs';
import { loadData } from '../lib/data.mjs';
import { weekCycle } from '../lib/cycle.mjs';

const root = resolve(import.meta.dirname, '..');
const { current } = await loadData(root);
const clean = html => plain(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ''));
async function download(url) {
  await delay(150);
  let target = new URL(url);
  // Kaynaklar TFF kulüp adreslerinden gelir; yalnız aynı alan adındaki yönlendirmeler izlenir.
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(target, { redirect: 'manual', headers: { 'User-Agent': 'PTnextResearch/0.3' }, signal: AbortSignal.timeout(15000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.get('location'), target);
      if (next.hostname.replace(/^www\./, '') !== target.hostname.replace(/^www\./, '') || !['https:', 'http:'].includes(next.protocol)) throw new Error('Kaynak alan adı dışına yönlendirme.');
      target = next; continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = new TextDecoder(/tff\.org$/.test(target.hostname) ? 'windows-1254' : 'utf-8').decode(await response.arrayBuffer());
    if (/500 HATA|ARADIĞINIZ SAYFAYA TEKNİK|access denied|just a moment|verify you are human/i.test(clean(html))) throw new Error('Kaynak haber yerine hata veya erişim doğrulama sayfası döndürdü.');
    return { url: target.href, html, retrievedAt: new Date().toISOString(), sha256: createHash('sha256').update(html).digest('hex') };
  }
  throw new Error('Çok fazla yönlendirme.');
}
const output = { season: current.season, targetRound: weekCycle(current.fixtures).targetRound, teams: [], discipline: null, errors: [] };
try {
  const page = await download('https://www.tff.org/default.aspx?pageID=238');
  output.discipline = { url: page.url, retrievedAt: page.retrievedAt, text: clean(page.html), sha256: page.sha256 };
} catch (error) { output.errors.push(`PFDK: ${error.message}`); }
for (const team of current.standings) {
  const row = { team: team.team, clubSource: `https://www.tff.org/Default.aspx?pageId=28&kulupId=${team.teamId}`, officialSite: null, documents: [], errors: [] };
  try {
    if (!/^\d+$/.test(team.teamId || '')) throw new Error('TFF kulüp kimliği eksik.');
    const club = await download(row.clubSource);
    const websites = [...club.html.matchAll(/<a\b[^>]*href="(https?:\/\/[^"\s]+)"[^>]*>([\s\S]*?)<\/a>/gi)].filter(m => /^www\.[a-z0-9.-]+\.[a-z]+\/?$/i.test(plain(m[2])));
    if (!websites.length) throw new Error('TFF kaydında resmî site adresi bulunamadı.');
    row.officialSite = websites[0][1].replace(/^http:/, 'https:');
    const home = await download(row.officialSite);
    row.documents.push({ url: home.url, retrievedAt: home.retrievedAt, text: clean(home.html).slice(0, 40000), sha256: home.sha256 });
    const links = [...home.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .filter(m => /sağlık|sakat|ceza|hazırlık|antrenman|kadro|transfer/i.test(plain(m[2]) + m[1]))
      .map(m => { try { return new URL(m[1].replace(/&amp;/g, '&'), home.url); } catch { return null; } })
      .filter(u => u && u.protocol === 'https:' && u.hostname.replace(/^www\./, '') === new URL(home.url).hostname.replace(/^www\./, '') && /haber|news/i.test(u.pathname));
    for (const url of [...new Set(links.map(u => u.href))].slice(0, 4)) {
      try { const page = await download(url); row.documents.push({ url: page.url, retrievedAt: page.retrievedAt, text: clean(page.html).slice(0, 40000), sha256: page.sha256 }); }
      catch (error) { row.errors.push(`${url}: ${error.message}`); }
    }
  } catch (error) { row.errors.push(error.message); }
  output.teams.push(row);
  console.log(`${row.team}: ${row.documents.length} haber kaynağı, ${row.errors.length} erişim/kapsam notu.`);
}
output.retrievedAt = new Date().toISOString();
const path = resolve(root, 'data/squad-news.json');
await writeFile(path + '.tmp', JSON.stringify(output));
await rename(path + '.tmp', path);
console.log('Haberler inceleme için kaydedildi; haber metninden kendiliğinden eksik oyuncu veya yüzde üretilmedi.');
