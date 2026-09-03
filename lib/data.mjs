import { readFile, readdir } from 'node:fs/promises';

export function csv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else cell += c;
  }
  if (quoted) throw new Error('CSV içinde kapanmamış tırnak var.');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const header = rows.shift();
  if (!header || new Set(header).size !== header.length) throw new Error('CSV başlığı geçersiz.');
  return rows.map((r, index) => {
    if (r.length !== header.length) throw new Error(`CSV ${index + 2}. satırın sütun sayısı yanlış.`);
    return Object.fromEntries(header.map((key, i) => [key, r[i]]));
  });
}

const definitions = [
  ['Galatasaray', 'GS', '#b51c34', ['GALATASARAY A.Ş.']],
  ['Fenerbahçe', 'FB', '#123b77', ['Fenerbahce', 'FENERBAHÇE A.Ş.']],
  ['Beşiktaş', 'BJK', '#262f3b', ['Besiktas', 'BEŞİKTAŞ A.Ş.']],
  ['Trabzonspor', 'TS', '#823556', ['TRABZONSPOR A.Ş.']],
  ['Başakşehir', 'BŞK', '#dc6d2f', ['Buyuksehyr', 'İSTANBUL BAŞAKŞEHİR FK', 'RAMS BAŞAKŞEHİR FUTBOL KULÜBÜ', 'RAMS BAŞAKŞEHİR FUTBOL KULÜBÜ A.Ş.']],
  ['Göztepe', 'GÖZ', '#b98a00', ['Goztep', 'Goztepe', 'GÖZTEPE A.Ş.']],
  ['Gençlerbirliği', 'GB', '#a72633', ['Genclerbirligi', 'NATURA DÜNYASI GENÇLERBİRLİĞİ']],
  ['Samsunspor', 'SAM', '#bf293e', ['SAMSUNSPOR A.Ş.', 'REEDER SAMSUNSPOR']],
  ['Kocaelispor', 'KOC', '#17846c', []],
  ['Çaykur Rizespor', 'RİZ', '#22847b', ['Rizespor', 'ÇAYKUR RİZESPOR A.Ş.']],
  ['Kasımpaşa', 'KAS', '#275bb2', ['Kasimpasa', 'KASIMPAŞA A.Ş.']],
  ['Alanyaspor', 'ALA', '#e48128', ['CORENDON ALANYASPOR']],
  ['Gaziantep FK', 'GFK', '#af273b', ['Gaziantep', 'GAZİANTEP FUTBOL KULÜBÜ A.Ş.']],
  ['Konyaspor', 'KON', '#237660', ['TÜMOSAN KONYASPOR']],
  ['Eyüpspor', 'EYÜ', '#725b9c', ['Eyupspor', 'İKAS EYÜPSPOR']],
  ['Amed SK', 'AMED', '#16805b', ['AMED SPORTİF FAALİYETLER']],
  ['Erzurumspor', 'ERZ', '#247bb0', ['Erzurum BB', 'ERZURUMSPOR FK']],
  ['Çorum FK', 'ÇOR', '#a32638', ['ARCA ÇORUM FK']],
  ['Adana Demirspor', 'ADS', '#4278ba', ['Ad. Demirspor', 'ADANA DEMİRSPOR A.Ş.']],
  ['Antalyaspor', 'ANT', '#c33540', ['ONVO ANTALYASPOR', 'HESAP.COM ANTALYASPOR', 'ANTALYASPOR A.Ş.']],
  ['Kayserispor', 'KAY', '#b89020', ['BELLONA KAYSERİSPOR', 'ZECORNER KAYSERİSPOR']],
  ['Sivasspor', 'SİV', '#bc2438', ['NET GLOBAL SİVASSPOR', 'EMS YAPI SİVASSPOR']],
  ['Hatayspor', 'HAT', '#792b37', ['ATAKAŞ HATAYSPOR']],
  ['Bodrum FK', 'BOD', '#1c8669', ['Bodrumspor', 'SİPAY BODRUM FK']],
  ['Fatih Karagümrük', 'FKG', '#b02b36', ['Karagumruk', 'FATİH KARAGÜMRÜK A.Ş.', 'MISIRLI.COM.TR FATİH KARAGÜMRÜK']],
  ['Ankaragücü', 'AG', '#ad9424', ['Ankaragucu', 'MKE ANKARAGÜCÜ']],
  ['Ümraniyespor', 'ÜMR', '#bb3043', ['Umraniyespor', 'HANGİKREDİ ÜMRANİYESPOR']],
  ['Yeni Malatyaspor', 'YMS', '#b79e22', ['ÖZNUR KABLO YENİ MALATYASPOR']],
  ['Adanaspor', 'ADA', '#d77929', ['ADANASPOR A.Ş.']],
  ['Akhisarspor', 'AKH', '#388163', []],
  ['Altay', 'ALT', '#353c47', []],
  ['Giresunspor', 'GİR', '#25846b', ['BITEXEN GİRESUNSPOR']],
  ['Bursaspor', 'BUR', '#28866b', []],
  ['Gaziantepspor', 'GSP', '#ad3241', []],
  ['İstanbulspor', 'İST', '#b69827', ['İSTANBULSPOR A.Ş.']],
  ['Karabükspor', 'KRB', '#38649c', ['KARDEMİR KARABÜKSPOR', 'Karabukspor']],
  ['Osmanlıspor', 'OSM', '#715986', ['OSMANLISPOR FUTBOL KULÜBÜ', 'Osmanlispor']],
  ['Pendikspor', 'PEN', '#b93948', ['PENDİKSPOR FUTBOL A.Ş.']],
  ['Denizlispor', 'DEN', '#27866d', ['YUKATEL DENİZLİSPOR']],
];
const fold = name => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = new Map(definitions.flatMap(([name,,, others]) => [name, ...others].map(alias => [fold(alias), name])));
export const canonicalTeam = name => aliases.get(fold(name)) || name.trim();
export function teamInfo(name) {
  const definition = definitions.find(d => d[0] === name);
  return { name, short: definition?.[1] || name.slice(0, 3).toLocaleUpperCase('tr-TR'), color: definition?.[2] || '#59708b' };
}
export function seasonFor(date) {
  const year = Number(date.slice(0, 4));
  const start = year === 2020 && date <= '2020-08-31' ? 2019 : (Number(date.slice(5, 7)) >= 7 ? year : year - 1);
  return `${start}-${start + 1}`;
}

export async function loadData(root) {
  const historical = csv(await readFile(`${root}/data/research/xgabora/super-lig-2010-2025.csv`, 'utf8')).map(r => {
    if (r.Division !== 'T1' || !/^\d{4}-\d{2}-\d{2}$/.test(r.MatchDate)) throw new Error('Geçersiz geçmiş maç kaydı.');
    const goals = [r.FTHome, r.FTAway].map(v => v === '' ? NaN : Number(v));
    if (goals.some(v => !Number.isInteger(v) || v < 0)) throw new Error('Geçersiz geçmiş maç skoru.');
    return { id: `archive:${r.MatchDate}:${r.HomeTeam}:${r.AwayTeam}`, date: r.MatchDate, time: null,
      season: seasonFor(r.MatchDate), round: null, home: canonicalTeam(r.HomeTeam), away: canonicalTeam(r.AwayTeam),
      homeGoals: goals[0], awayGoals: goals[1],
      // Gelişmiş istatistik dönemindeki boş alanlar, hükmen maç olasılığı nedeniyle eğitimden çıkarılır.
      excluded: r.MatchDate >= '2017-07-01' && r.HomeShots === '',
      source: 'https://github.com/xgabora/Club-Football-Match-Data-2000-2025',
    };
  });
  const seasons = [];
  const seasonNames = (await readdir(`${root}/data/normalized`)).filter(f => /^\d{4}-\d{4}\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
  if (!seasonNames.length) throw new Error('Normalize edilmiş sezon verisi bulunamadı.');
  for (const season of seasonNames) {
    const data = JSON.parse(await readFile(`${root}/data/normalized/${season}.json`, 'utf8'));
    data.fixtures = data.fixtures.map(m => ({ ...m, home: canonicalTeam(m.home), away: canonicalTeam(m.away) }));
    data.standings = data.standings.map(t => ({ ...t, team: canonicalTeam(t.team) }));
    seasons.push(data);
  }
  const oldMatches = historical.filter(m => m.season < '2024-2025');
  const flags = new Map(historical.map(m => [`${m.season}:${m.home}:${m.away}`, m.excluded]));
  const overrides = JSON.parse(await readFile(`${root}/data/match-overrides.json`, 'utf8'));
  const updated = seasons.flatMap(s => s.fixtures.filter(m => m.homeGoals !== null).map(m => ({
    ...m, excluded: flags.get(`${m.season}:${m.home}:${m.away}`) || overrides.some(o => o.id === m.id && o.excluded),
  })));
  const matches = [...oldMatches, ...updated].sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  if (matches.some(m => !m.date || m.home === m.away)) throw new Error('Tarihi veya takım eşleşmesi geçersiz maç.');
  if (new Set(matches.map(m => `${m.season}:${m.home}:${m.away}`)).size !== matches.length) throw new Error('Birleştirmede yinelenen maç var.');
  return { matches, seasons, current: seasons.at(-1), sourceCount: historical.length };
}
