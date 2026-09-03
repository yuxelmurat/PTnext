// TFF'nin yayımladığı fikstür ve puan cetvelinin dar kapsamlı okuyucusu.
// Kaynak yapısı değiştiğinde sessizce eksik veri üretmek yerine hata verir.
export function plain(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

export function parseTff(html) {
  const season = html.match(/Süper Lig (\d{4}-\d{4}) Sezonu/)?.[1]
    || html.match(/(\d{4}-\d{4}) Sezonu (?:Spor Toto )?Süper Lig Fikstürü/)?.[1];
  const start = html.indexOf('fiksturListesiTable');
  if (!season || start < 0) throw new Error('TFF sezonu veya fikstür listesi bulunamadı.');
  const fixtures = [];
  let round = 0;
  let pending = [];
  for (const token of html.slice(start).matchAll(/(\d+)\.Hafta<\/td>|<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    if (token[1]) { round = Number(token[1]); pending = []; continue; }
    if (!round) continue;
    const club = token[2].match(/kulupId=(\d+)/i)?.[1];
    const matchId = token[2].match(/macId=(\d+)/i)?.[1];
    if (club) pending.push({ id: club, name: plain(token[3]) });
    else if (matchId && pending.length === 1) {
      const scoreText = plain(token[3]);
      const score = scoreText.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!score && scoreText !== '-') throw new Error(`TFF ${matchId}: bilinmeyen skor ${scoreText}`);
      pending.push({ matchId, homeGoals: score ? Number(score[1]) : null, awayGoals: score ? Number(score[2]) : null });
    }
    if (pending.length === 3) {
      const [home, result, away] = pending;
      fixtures.push({ id: result.matchId, season, round, home: home.name, away: away.name,
        homeId: home.id, awayId: away.id, homeGoals: result.homeGoals, awayGoals: result.awayGoals,
        date: null, time: null, source: `https://www.tff.org/Default.aspx?pageId=29&macId=${result.matchId}` });
      pending = [];
    }
  }
  const standings = [];
  for (const row of html.matchAll(/<tr\b[^>]*>((?:(?!<tr\b)[\s\S])*?)<\/tr>/gi)) {
    if (!row[1].includes('grvACetvel') || !row[1].includes('lnkTakim')) continue;
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => plain(m[1]));
    if (cells.length !== 9) throw new Error('TFF puan cetveli sütunları değişti.');
    const name = cells[0].match(/^(\d+)\.(.+)$/);
    const values = cells.slice(1).map(Number);
    if (!name || values.some(n => !Number.isInteger(n))) throw new Error('TFF puan cetveli okunamadı.');
    const [played, won, drawn, lost, gf, ga, gd, points] = values;
    const teamId = row[1].match(/kulupId=(\d+)/i)?.[1];
    standings.push({ rank: Number(name[1]), team: name[2], teamId, played, won, drawn, lost, gf, ga, gd, points });
  }
  const dates = parseTffWeek(html);
  for (const match of fixtures) Object.assign(match, dates.find(d => d.id === match.id) || {});
  const teams = new Set(fixtures.flatMap(m => [m.homeId, m.awayId]));
  if (teams.size < 16 || fixtures.length !== teams.size * (teams.size - 1)) {
    throw new Error(`TFF fikstürü eksik: ${teams.size} takım, ${fixtures.length} maç.`);
  }
  if (new Set(fixtures.map(m => m.id)).size !== fixtures.length || new Set(fixtures.map(m => `${m.homeId}:${m.awayId}`)).size !== fixtures.length) {
    throw new Error('TFF fikstüründe yinelenen maç/eşleşme var.');
  }
  if (standings.length !== teams.size) throw new Error('TFF puan cetvelinde takım eksik.');
  return { season, fixtures, standings };
}

export function parseTffWeek(html) {
  const dates = [];
  for (const row of html.matchAll(/<tr\b[^>]*class="haftaninMaclariTr"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const id = row[1].match(/macId=(\d+)/i)?.[1];
    const date = row[1].match(/id="[^"]+_lblTarih"[^>]*>([^<]*)</)?.[1]?.trim();
    const time = row[1].match(/id="[^"]+_lblSaat"[^>]*>([^<]*)</)?.[1]?.trim();
    if (!id || !date) continue;
    const parts = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!parts) throw new Error(`TFF maç tarihi geçersiz: ${date}`);
    dates.push({ id, date: `${parts[3]}-${parts[2]}-${parts[1]}`, time: /^\d{2}:\d{2}$/.test(time || '') ? time : null });
  }
  return dates;
}

export function parseReferee(html, match) {
  if (!html.includes('dtMacBilgisiHakemler')) throw new Error(`${match.id}: TFF maç/hakem bölümü bulunamadı.`);
  for (const id of [match.homeId, match.awayId]) {
    if (id && !new RegExp(`kulupId=${id}(?:[&"'])`, 'i').test(html)) throw new Error(`${match.id}: takım kimliği kaynakla uyuşmuyor.`);
  }
  const crew = [];
  for (const link of html.matchAll(/<a\b[^>]*href="([^"]*hakemId=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = plain(link[3]);
    const parts = label.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (parts) crew.push({ id: link[2], name: parts[1].trim(), role: parts[2].trim() });
  }
  const referees = crew.filter(r => r.role === 'Hakem');
  if (referees.length > 1) throw new Error(`${match.id}: birden çok orta hakem kaydı var.`);
  return { matchId: match.id, referee: referees[0] || null, crew,
    status: referees.length ? 'assigned' : 'not-listed' };
}
