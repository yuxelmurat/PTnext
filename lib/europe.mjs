import { canonicalTeam } from './data.mjs';

// OpenFootball ana turnuva dosyaları: maç tarihleri okunur, eksik satır atlanmaz.
export function parseEuropeanMatches(text, season, competition, source) {
  const start = Number(season.slice(0, 4));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const teams = new Map([
    ['Galatasaray SK', 'Galatasaray'], ['Fenerbahçe SK', 'Fenerbahçe'], ['Beşiktaş JK', 'Beşiktaş'],
    ['İstanbul Başakşehir', 'Başakşehir'], ['İstanbul Başakşehir FK', 'Başakşehir'], ['Medipol Başakşehir', 'Başakşehir'],
  ]);
  let date;
  const matches = [];
  for (const line of text.split(/\r?\n/)) {
    const day = line.match(/^\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\w{3})\s+(\d{1,2})(?:\s+(\d{4}))?\s*$/);
    if (day) {
      const month = months.indexOf(day[1]) + 1;
      if (!month) throw new Error(`Avrupa maç ayı okunamadı: ${line}`);
      const year = Number(day[3] || start + Number(month < 7));
      date = `${year}-${String(month).padStart(2, '0')}-${day[2].padStart(2, '0')}`;
      if (new Date(date).toISOString().slice(0, 10) !== date || ![start, start + 1].includes(year)) throw new Error('Avrupa maç tarihi sezon dışında.');
    }
    if (!line.includes('(TUR)') || !line.includes(' v ')) continue;
    const match = line.match(/^\s*(?:\d{2}:\d{2}\s+)?(.+?)\s+\(([A-Z]{3})\)\s+v\s+(.+?)\s+\(([A-Z]{3})\)\s+(\d+)-(\d+)/);
    if (!match || !date) throw new Error(`Türk takımının Avrupa maçı okunamadı: ${line}`);
    for (const side of ['home', 'away']) {
      const country = side === 'home' ? match[2] : match[4];
      if (country !== 'TUR') continue;
      const raw = (side === 'home' ? match[1] : match[3]).trim();
      matches.push({ date, season, competition, team: teams.get(raw) || canonicalTeam(raw),
        opponent: (side === 'home' ? match[3] : match[1]).trim(), away: side === 'away', source });
    }
  }
  return matches;
}
