// İstemci ve veri üretimi aynı olasılık ve puan tablosu hesaplarını kullanır.
export const MODEL_VERSION = 'poisson-0.3';
export function createModel() {
  return { teams: {}, homeBase: Math.log(1.5), awayBase: Math.log(1.15), season: null, outcomes: [1, 1, 1], count: 0 };
}
export function enterSeason(model, season) {
  if (model.season === season) return;
  if (model.season) for (const team of Object.values(model.teams)) { team.attack *= 0.7; team.defence *= 0.7; }
  model.season = season;
}
function strength(model, name) { return model.teams[name] || { attack: 0, defence: 0, played: 0 }; }
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export function goalDistribution(mean) {
  if (!Number.isFinite(mean) || mean <= 0 || mean > 10) throw new Error('Gol ortalaması geçersiz.');
  const probabilities = [Math.exp(-mean)];
  for (let g = 1; g <= 20; g++) probabilities.push(probabilities[g - 1] * mean / g);
  const total = probabilities.reduce((a, b) => a + b, 0);
  return probabilities.map(p => p / total);
}
export function fromMeans(homeMean, awayMean) {
  const homeGoals = goalDistribution(homeMean), awayGoals = goalDistribution(awayMean);
  let home = 0, draw = 0, away = 0, over25 = 0, btts = 0, best = 0, likelyScore = '0-0';
  const scores = [];
  for (let h = 0; h < homeGoals.length; h++) for (let a = 0; a < awayGoals.length; a++) {
    const p = homeGoals[h] * awayGoals[a];
    const outcome = h > a ? 'H' : h < a ? 'A' : 'D';
    if (outcome === 'H') home += p; else if (outcome === 'A') away += p; else draw += p;
    if (h + a > 2) over25 += p;
    if (h > 0 && a > 0) btts += p;
    if (p > best) { best = p; likelyScore = `${h}-${a}`; }
    scores.push({ h, a, p, outcome });
  }
  return { home, draw, away, homeMean, awayMean, over25, btts, likelyScore, scoreProbability: best, scores };
}
export function predict(model, home, away) {
  const h = strength(model, home), a = strength(model, away);
  return { ...fromMeans(clamp(Math.exp(model.homeBase + h.attack + a.defence), 0.2, 4.5),
    clamp(Math.exp(model.awayBase + a.attack + h.defence), 0.2, 4.5)),
    evidence: { homeMatches: h.played, awayMatches: a.played, homeAttack: h.attack, awayAttack: a.attack } };
}
export function updateModel(model, match, prediction) {
  if (match.excluded) return;
  const h = model.teams[match.home] ||= { attack: 0, defence: 0, played: 0 };
  const a = model.teams[match.away] ||= { attack: 0, defence: 0, played: 0 };
  const homeError = clamp(match.homeGoals - prediction.homeMean, -3, 3);
  const awayError = clamp(match.awayGoals - prediction.awayMean, -3, 3);
  h.attack = clamp(h.attack * 0.998 + 0.025 * homeError, -0.8, 0.8);
  a.defence = clamp(a.defence * 0.998 + 0.025 * homeError, -0.8, 0.8);
  a.attack = clamp(a.attack * 0.998 + 0.025 * awayError, -0.8, 0.8);
  h.defence = clamp(h.defence * 0.998 + 0.025 * awayError, -0.8, 0.8);
  h.played++; a.played++; model.count++;
  model.homeBase += 0.001 * homeError;
  model.awayBase += 0.001 * awayError;
  model.outcomes[match.homeGoals > match.awayGoals ? 0 : match.homeGoals === match.awayGoals ? 1 : 2]++;
}
export function learnDay(model, matches) {
  if (!matches.length) return [];
  const seasons = new Set(matches.map(m => m.season));
  if (seasons.size !== 1) throw new Error('Aynı eğitim gününde iki sezon bulundu.');
  enterSeason(model, matches[0].season);
  // Aynı günün bütün tahminleri, o günün hiçbir sonucu görülmeden üretilir.
  const predictions = matches.map(m => predict(model, m.home, m.away));
  matches.forEach((m, i) => updateModel(model, m, predictions[i]));
  return predictions;
}
export function emptyTable(teams) {
  return teams.map((team, i) => ({ team, rank: i + 1, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] }));
}
export function applyScore(table, match, h = match.homeGoals, a = match.awayGoals) {
  if (![h, a].every(g => Number.isInteger(g) && g >= 0)) throw new Error('Skor negatif olmayan tam sayı olmalı.');
  const home = table.find(t => t.team === match.home), away = table.find(t => t.team === match.away);
  if (!home || !away || home === away) throw new Error('Puan tablosunda takım bulunamadı.');
  home.played++; away.played++;
  home.gf += h; home.ga += a; away.gf += a; away.ga += h;
  home.gd = home.gf - home.ga; away.gd = away.gf - away.ga;
  if (h > a) { home.won++; away.lost++; home.points += 3; }
  else if (h < a) { away.won++; home.lost++; away.points += 3; }
  else { home.drawn++; away.drawn++; home.points++; away.points++; }
  home.form?.push(h > a ? 'G' : h === a ? 'B' : 'M');
  away.form?.push(h < a ? 'G' : h === a ? 'B' : 'M');
}
export function rankTable(table, playedMatches = []) {
  const groups = new Map();
  for (const row of table) { if (!groups.has(row.points)) groups.set(row.points, []); groups.get(row.points).push(row); }
  const result = [];
  for (const points of [...groups.keys()].sort((a, b) => b - a)) {
    const group = groups.get(points);
    const names = new Set(group.map(t => t.team));
    const mutual = playedMatches.filter(m => names.has(m.home) && names.has(m.away));
    let mini = null;
    if (group.length > 1 && mutual.length === group.length * (group.length - 1)) {
      mini = emptyTable([...names]); mutual.forEach(m => applyScore(mini, m));
    }
    group.sort((a, b) => {
      if (mini) {
        const ah = mini.find(t => t.team === a.team), bh = mini.find(t => t.team === b.team);
        const diff = bh.points - ah.points || bh.gd - ah.gd || bh.gf - ah.gf;
        if (diff) return diff;
      }
      // Tam eşitlikte mevcut sıra korunur; kesin resmî karar gibi sunulmaz.
      return b.gd - a.gd || b.gf - a.gf || a.rank - b.rank;
    });
    result.push(...group);
  }
  return result.map((row, i) => ({ ...row, rank: i + 1 }));
}
export function standings(teams, matches) {
  const table = emptyTable(teams);
  matches.forEach(m => applyScore(table, m));
  return rankTable(table, matches);
}
// Önce en olası 1/X/2 sonucu, ardından o sonuç içindeki en olası skor seçilir.
export function selectScore(prediction, condition) {
  if (condition && !['H', 'D', 'A'].includes(condition)) throw new Error('Geçersiz maç senaryosu.');
  const outcome = condition || [['H', prediction.home], ['D', prediction.draw], ['A', prediction.away]]
    .reduce((best, item) => item[1] > best[1] ? item : best)[0];
  const scores = prediction.scores.filter(s => s.outcome === outcome);
  if (!scores.length || scores.some(s => !Number.isFinite(s.p) || s.p < 0)) throw new Error('Skor dağılımı geçersiz.');
  const best = scores.reduce((a, b) => b.p > a.p ? b : a);
  return { homeGoals: best.h, awayGoals: best.a, outcome, probability: best.p };
}
export function projectTable(baseTable, fixtures, options = {}) {
  const table = structuredClone(baseTable);
  const played = options.playedMatches || [];
  const seen = new Set(played.map(m => m.id).filter(Boolean));
  const conditions = options.conditions || {};
  const pending = fixtures.filter(m => !seen.has(m.id));
  if (Object.keys(conditions).some(id => !pending.some(m => m.id === id))) throw new Error('Senaryo yalnızca oynanmamış maçlara uygulanabilir.');
  const picks = pending.map(m => {
    if (!m.id || seen.has(m.id)) throw new Error('Tekrarlanan veya kimliği eksik maç.');
    seen.add(m.id);
    const pick = { id: m.id, home: m.home, away: m.away, ...selectScore(m.prediction, conditions[m.id]) };
    applyScore(table, pick);
    return pick;
  });
  return { table: rankTable(table, [...played, ...picks]), picks };
}
export function randomGenerator(seed = 2026) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function simulate(baseTable, fixtures, options = {}) {
  const runs = options.runs || 10000;
  if (!Number.isInteger(runs) || runs < 1 || runs > 100000) throw new Error('Simülasyon sayısı geçersiz.');
  const random = randomGenerator(options.seed || 2026);
  const conditions = options.conditions || {};
  const stats = new Map(baseTable.map(t => [t.team, { team: t.team, expectedPoints: 0, expectedRank: 0, leader: 0, top4: 0, up: 0, ranks: Array(baseTable.length).fill(0),
    ...(options.collectConditions ? { conditional: fixtures.map(m => ({ id: m.id, outcomes: Object.fromEntries(['H', 'D', 'A'].map(k => [k, { count: 0, leader: 0, top4: 0, up: 0, expectedRank: 0 }])) })) } : {}) }]));
  const distributions = fixtures.map(m => {
    const condition = conditions[m.id];
    if (condition && !['H', 'D', 'A'].includes(condition)) throw new Error('Geçersiz maç senaryosu.');
    const scores = m.prediction.scores.filter(s => !condition || s.outcome === condition);
    const total = scores.reduce((sum, s) => sum + s.p, 0);
    let cumulative = 0;
    return scores.map(s => ({ ...s, cumulative: (cumulative += s.p / total) }));
  });
  for (let n = 0; n < runs; n++) {
    const outcomes = [];
    const table = baseTable.map(t => ({ ...t, form: undefined }));
    const played = [...(options.playedMatches || [])];
    fixtures.forEach((m, i) => {
      const roll = random();
      const score = distributions[i].find(s => roll <= s.cumulative) || distributions[i].at(-1);
      outcomes.push(score.outcome);
      applyScore(table, m, score.h, score.a);
      played.push({ home: m.home, away: m.away, homeGoals: score.h, awayGoals: score.a });
    });
    for (const row of rankTable(table, played)) {
      const stat = stats.get(row.team), original = baseTable.find(t => t.team === row.team);
      stat.expectedPoints += row.points / runs;
      stat.expectedRank += row.rank / runs;
      stat.leader += (row.rank === 1 ? 1 : 0) / runs;
      stat.top4 += (row.rank <= 4 ? 1 : 0) / runs;
      stat.up += (row.rank < original.rank ? 1 : 0) / runs;
      stat.ranks[row.rank - 1]++;
      if (stat.conditional) outcomes.forEach((outcome, i) => {
        const part = stat.conditional[i].outcomes[outcome];
        part.count++; part.leader += Number(row.rank === 1); part.top4 += Number(row.rank <= 4);
        part.up += Number(row.rank < original.rank); part.expectedRank += row.rank;
      });
    }
  }
  return [...stats.values()].map(stat => {
    for (const match of stat.conditional || []) for (const part of Object.values(match.outcomes)) {
      for (const key of ['leader', 'top4', 'up', 'expectedRank']) part[key] = part.count ? part[key] / part.count : null;
    }
    const quantile = q => { let total = 0; return stat.ranks.findIndex(n => (total += n) >= runs * q) + 1; };
    return { ...stat, rankLow: quantile(0.1), rankHigh: quantile(0.9) };
  }).sort((a, b) => a.expectedRank - b.expectedRank).map((s, i) => ({ ...s, projectedRank: i + 1 }));
}
