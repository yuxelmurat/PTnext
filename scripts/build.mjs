import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadData, teamInfo } from '../lib/data.mjs';
import { createModel, learnDay, enterSeason, predict, standings, simulate, projectTable, MODEL_VERSION } from '../public/model.js';
import { weekCycle, kickoff } from '../lib/cycle.mjs';
import { refereeAnalysis, adjustedPrediction, predictionLoss, refereeValidation } from '../lib/referee.mjs';
import { weeklyReports, europeanCases, currentSeasonHistory } from '../lib/insights.mjs';
import { createSquadModel, lineupEffect, learnLineup, squadPrediction, expectedSquad, validateSquadReview, SQUAD_VERSION, SQUAD_CONFIG } from '../lib/squad.mjs';

const root = resolve(import.meta.dirname, '..');
const data = await loadData(root);
const { matches, current } = data;
const standingsHistory = JSON.parse(await readFile(resolve(root, 'data/standings-history.json'), 'utf8'));
const europe = europeanCases(JSON.parse(await readFile(resolve(root, 'data/europe.json'), 'utf8')), matches);
const generatedAt = new Date().toISOString();
let referees = { records: {} };
try { referees = JSON.parse(await readFile(resolve(root, 'data/referees.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let squads = { records: {} }, squadReview = { schemaVersion: 1, teams: [], events: [] };
try { squads = JSON.parse(await readFile(resolve(root, 'data/squads.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
try {
  const storedReview = JSON.parse(await readFile(resolve(root, 'data/squad-review.json'), 'utf8'));
  // Sezon değişince eski oyuncu incelemesi arşivde kalır; yeni sezonun kadrosuna taşınmaz.
  if (!storedReview.season || storedReview.season === current.season) squadReview = validateSquadReview(storedReview, current.fixtures);
}
catch (error) { if (error.code !== 'ENOENT') throw error; }
const cycle = weekCycle(current.fixtures);
const { targetRound, played } = cycle;
const teams = current.standings.map(t => t.team);
const predictionDir = resolve(root, 'data/predictions');
await mkdir(predictionDir, { recursive: true });
let lastOutput;
try { lastOutput = JSON.parse(await readFile(resolve(root, 'public/data/dashboard.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const computed = standings(teams, played);
for (const row of computed) {
  const official = current.standings.find(t => t.team === row.team);
  for (const key of ['played', 'won', 'drawn', 'lost', 'gf', 'ga', 'points']) {
    if (row[key] !== official[key]) throw new Error(`${row.team}: resmî ${key} ile hesaplanan değer farklı. Puan cezası/düzeltme incelenmeli.`);
  }
}

const model = createModel();
const days = Map.groupBy(matches, m => m.date);
const validationRows = [];
const validationSeasons = new Set(data.seasons.filter(s => s.fixtures.every(m => m.homeGoals !== null)).slice(-2).map(s => s.season));
const refereeHistory = [], refereeTestRows = [];
const squadModel = createSquadModel(), squadTestRows = [];
const refereeTestSeason = data.seasons.filter(s => s.fixtures.every(m => m.homeGoals !== null)).at(-1)?.season;
let refereeTestTotal = 0;
for (const [date, day] of days) {
  const total = model.outcomes.reduce((a, b) => a + b, 0);
  const baseline = model.outcomes.map(n => n / total);
  const predictions = learnDay(model, day);
  // Kadro katsayıları da aynı günün hiçbir sonucu öğrenilmeden sınanır.
  day.forEach((match, i) => {
    const record = squads.records[match.id];
    if (match.excluded || !record || match.season !== refereeTestSeason) return;
    const home = lineupEffect(squadModel, match.home, record.home.players.filter(p => p.starter).map(p => p.id));
    const away = lineupEffect(squadModel, match.away, record.away.players.filter(p => p.starter).map(p => p.id));
    squadTestRows.push({ season: match.season, round: match.round, eligible: home.eligible && away.eligible,
      base: predictionLoss(predictions[i], match), candidate: predictionLoss(squadPrediction(predictions[i], home, away), match) });
  });
  day.forEach((match, i) => {
    if (match.excluded) return;
    const assignment = referees.records[match.id];
    if (match.season === refereeTestSeason) refereeTestTotal++;
    if (!assignment?.referee) return;
    const analysis = refereeAnalysis(refereeHistory, assignment, match.home, match.away, date);
    if (match.season === refereeTestSeason) refereeTestRows.push({ season: match.season, round: match.round, eligible: analysis.eligible,
      base: predictionLoss(predictions[i], match), candidate: predictionLoss(adjustedPrediction(predictions[i], analysis), match) });
    refereeHistory.push({ ...match, refereeId: assignment.referee.id,
      baseline: { home: predictions[i].home, draw: predictions[i].draw, away: predictions[i].away } });
  });
  day.forEach((match, i) => {
    if (match.excluded || !validationSeasons.has(match.season)) return;
    const p = predictions[i];
    const probabilities = [p.home, p.draw, p.away];
    const outcome = match.homeGoals > match.awayGoals ? 0 : match.homeGoals === match.awayGoals ? 1 : 2;
    const loss = values => ({ brier: values.reduce((sum, v, j) => sum + (v - Number(j === outcome)) ** 2, 0),
      logLoss: -Math.log(Math.max(1e-12, values[outcome])), accuracy: Number(values.indexOf(Math.max(...values)) === outcome) });
    validationRows.push({ season: match.season, date: match.date, home: match.home, away: match.away,
      model: loss(probabilities), baseline: loss(baseline), confidence: Math.max(...probabilities) });
  });
  day.forEach((match, i) => learnLineup(squadModel, match, squads.records[match.id], predictions[i]));
}
function aggregate(rows) {
  if (!rows.length) throw new Error('Doğrulama için maç bulunamadı.');
  return { count: rows.length, ...Object.fromEntries(['model', 'baseline'].map(name => [name,
    Object.fromEntries(['brier', 'logLoss', 'accuracy'].map(metric => [metric, rows.reduce((sum, r) => sum + r[name][metric], 0) / rows.length]))])) };
}
const validation = { ...aggregate(validationRows), bySeason: [...new Set(validationRows.map(r => r.season))].map(season => ({ season, ...aggregate(validationRows.filter(r => r.season === season)) })),
  calibration: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(low => {
    const rows = validationRows.filter(r => r.confidence >= low && r.confidence < low + 0.1);
    return { low, count: rows.length, confidence: rows.length ? rows.reduce((s, r) => s + r.confidence, 0) / rows.length : null,
      accuracy: rows.length ? rows.reduce((s, r) => s + r.model.accuracy, 0) / rows.length : null };
  }), method: 'Tamamlanmış son iki sezonun maçları kronolojik sırayla, her günün sonuçları öğrenilmeden tahmin edildi. Sonraki gün için önceki sonuçlarla model güncellendi. Karşılaştırma: o ana kadarki lig geneli ev/beraberlik/deplasman sıklıkları. Bu ölçüm maç olasılıklarını değerlendirir; hafta sonu sıra tahmininin isabet ölçümü değildir.' };
const refereeCheck = refereeValidation(refereeTestRows, refereeTestTotal, refereeTestSeason || null);
// Aynı hafta kümeli hata karşılaştırması kullanılır; eşik geçilmeden ana tahmin değiştirilmez.
const squadCheck = { ...refereeValidation(squadTestRows, refereeTestTotal, refereeTestSeason || null), config: SQUAD_CONFIG,
  modelVersion: SQUAD_VERSION, method: 'Gerçek ilk 11 varsayımıyla kronolojik test. Kadro açıklanma saatleri arşivlenmedi; bu sonuç perşembe tahmininin canlı başarısı değildir.' };
validation.records = validationRows.map(r => ({ season: r.season, date: r.date, home: r.home, away: r.away,
  confidence: r.confidence, correct: r.model.accuracy }));

const snapshots = [];
for (let round = Math.max(1, targetRound - 3); round <= targetRound; round++) {
  const roundFixtures = current.fixtures.filter(m => m.round === round);
  if (roundFixtures.some(m => !m.date)) throw new Error(`${round}. hafta için tarihler eksik.`);
  const cutoff = roundFixtures.map(m => m.date).sort()[0];
  const active = round === targetRound;
  const openingPath = resolve(predictionDir, `${current.season}-week-${round}-opening-v2.json`);
  let opening;
  try { opening = JSON.parse(await readFile(openingPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Yayımlanmış hafta başı tahmini, gerçekleşen sonuçlarla yeniden yazılmaz.
  if (!active && opening) {
    snapshots.push({ ...opening.snapshot, archived: true, retrospective: false,
      fixtures: opening.snapshot.fixtures.map(m => ({ ...m, result: (() => { const result = roundFixtures.find(r => r.id === m.id); return result?.homeGoals !== null && result ? `${result.homeGoals}-${result.awayGoals}` : null; })() })) });
    continue;
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const past = matches.filter(m => m.date < (active ? today : cutoff));
  const weekModel = createModel();
  for (const day of Map.groupBy(past, m => m.date).values()) learnDay(weekModel, day);
  enterSeason(weekModel, current.season);
  const previous = active ? played : past.filter(m => m.season === current.season);
  // Geçmiş canlandırmalarda bugünkü sıralama, eşitlik bozucu olarak kullanılmaz.
  let table = standings([...teams].sort((a, b) => a.localeCompare(b, 'tr')), previous);
  if (active) table = current.standings.map(row => ({ ...row, form: table.find(t => t.team === row.team).form }));
  const candidates = active ? cycle.pending : roundFixtures;
  const fixtures = candidates.map(m => {
    const previousForecast = lastOutput?.season === current.season ? lastOutput.snapshots.find(s => s.round === round)?.fixtures.find(f => f.id === m.id) : null;
    const locked = active && kickoff(m) <= Date.now();
    const saved = previousForecast || opening?.snapshot.fixtures.find(f => f.id === m.id);
    if (locked && !saved) throw new Error(`Başlamış ${m.id} maçı için önceden kayıtlı tahmin yok; maç öncesi tahmin uydurulmadı.`);
    const predictedAt = locked ? (saved.predictedAt || lastOutput?.generatedAt || opening?.generatedAt) : generatedAt;
    if (locked && !(Date.parse(predictedAt) < kickoff(m))) throw new Error(`${m.id} için maç öncesi kayıt zamanı doğrulanamadı.`);
    const basePrediction = predict(weekModel, m.home, m.away);
    const homeSquad = active ? expectedSquad(squadModel, m.home, m, squadReview) : null;
    const awaySquad = active ? expectedSquad(squadModel, m.away, m, squadReview) : null;
    const squadCandidate = active ? squadPrediction(basePrediction, homeSquad.effect, awaySquad.effect) : basePrediction;
    const squad = active ? { home: homeSquad, away: awaySquad,
      applied: !locked && squadCheck.approved && homeSquad.effect.eligible && awaySquad.effect.eligible,
      baseHome: basePrediction.home, candidateHome: squadCandidate.home,
      baseAway: basePrediction.away, candidateAway: squadCandidate.away, modelVersion: SQUAD_VERSION } : null;
    const referee = refereeAnalysis(refereeHistory, referees.records[m.id], m.home, m.away, active ? today : cutoff);
    const candidate = adjustedPrediction(basePrediction, referee);
    // Tarihsel canlandırmaya daha sonraki doğrulama kararını taşıyarak veri sızıntısı yapılmaz.
    referee.applied = active && !locked && !squad?.applied && refereeCheck.approved && referee.eligible;
    referee.baseHome = basePrediction.home;
    referee.candidateHome = candidate.home;
    referee.finalHome = referee.applied ? candidate.home : basePrediction.home;
    referee.appliedShift = referee.finalHome - referee.baseHome;
    return { id: m.id, date: m.date, time: m.time, round,
    home: m.home, away: m.away, source: m.source,
    result: round < targetRound && m.homeGoals !== null ? `${m.homeGoals}-${m.awayGoals}` : null,
    prediction: locked ? saved.prediction : squad?.applied ? squadCandidate : referee.applied ? candidate : basePrediction,
    squad: locked ? saved.squad || null : squad,
    referee: locked ? (saved.referee || { status: 'archived-without-referee', eligible: false, applied: false, appliedShift: 0 }) : referee,
    locked, predictedAt,
    h2h: past.filter(p => (p.home === m.home && p.away === m.away) || (p.home === m.away && p.away === m.home)).slice(-5).reverse(),
    recentHome: past.filter(p => p.home === m.home || p.away === m.home).slice(-5).reverse(),
    recentAway: past.filter(p => p.home === m.away || p.away === m.away).slice(-5).reverse(),
  }; });
  const forecast = simulate(table, fixtures, { runs: 10000, seed: 2026 + round, playedMatches: previous, collectConditions: true });
  const projection = projectTable(table, fixtures, { playedMatches: previous });
  const snapshot = { round, cutoff, retrospective: !active, table, fixtures, forecast, projection, playedMatches: previous,
    status: active ? cycle.status : 'retrospective', completedMatches: active ? roundFixtures.filter(m => m.homeGoals !== null) : [],
    generatedAt, trainingMatches: past.filter(m => !m.excluded).length };
  snapshots.push(snapshot);
  if (active && !opening && roundFixtures.every(m => m.homeGoals === null && kickoff(m) > Date.now())) {
    await writeFile(openingPath, JSON.stringify({ generatedAt, sourceRetrievedAt: current.retrievedAt, modelVersion: MODEL_VERSION, snapshot }), { flag: 'wx' });
  }
  console.log(`${round}. hafta: ${fixtures.length} maç, 10.000 senaryo, eğitim ${past.length} geçmiş maç.`);
}
const coverage = [...Map.groupBy(matches, m => m.season)].map(([season, rows]) => ({ season, matches: rows.length, excluded: rows.filter(m => m.excluded).length,
  source: season >= '2024-2025' ? 'TFF' : 'GitHub / football-data', complete: season !== current.season }));
const reports = await weeklyReports(root, current, snapshots, lastOutput?.reports || []);
const currentJourney = await currentSeasonHistory(root, current, lastOutput?.currentJourney);
const output = { generatedAt, sourceRetrievedAt: current.retrievedAt, season: current.season, currentRound: cycle.status === 'complete' ? targetRound : targetRound - 1, targetRound, status: cycle.status,
  modelVersion: MODEL_VERSION, teams: teams.map(teamInfo), snapshots, validation, coverage, standingsHistory,
  reports, currentJourney, europe,
  insightTeams: [...new Set([...teams, ...standingsHistory.seasons.flatMap(s => s.teams)])].sort((a, b) => a.localeCompare(b, 'tr')).map(teamInfo),
  teamFixtures: current.fixtures.map(({ id, round, home, away, date, time, homeGoals, awayGoals, source }) => ({ id, round, home, away, date, time, homeGoals, awayGoals, source })),
  refereeValidation: refereeCheck,
  squadValidation: squadCheck,
  squadCoverage: { matches: Object.keys(squads.records).length, updatedAt: squads.updatedAt || null,
    reviewedTeams: squadReview.teams.filter(t => t.status === 'reviewed').length, events: squadReview.events.length,
    reviewHours: SQUAD_CONFIG.reviewHours, nextReview: 'Perşembe 18:00 · Türkiye saati',
    scope: 'TFF ilk 11 ve maç yedekleri; tam lisanslı kadro veya oyuncu piyasa değeri değildir.' },
  refereeCoverage: { assignments: Object.values(referees.records).filter(r => r.referee).length,
    trainingMatches: refereeHistory.length, updatedAt: referees.updatedAt || null,
    seasons: [...new Set(refereeHistory.map(r => r.season))] },
  matchCount: matches.length, excludedCount: matches.filter(m => m.excluded).length,
  sources: [{ label: 'TFF · güncel fikstür ve puan cetveli', url: current.source },
    { label: 'TFF · 2024–2025', url: data.seasons[0].source }, { label: 'TFF · 2025–2026', url: data.seasons[1].source },
    { label: 'GitHub · geçmiş maç arşivi', url: 'https://github.com/xgabora/Club-Football-Match-Data-2000-2025' },
    { label: 'OpenFootball · Avrupa ana turnuvaları', url: 'https://github.com/openfootball/champions-league' }],
  limitations: ['Kadro katmanı geçmiş ilk 11 ve kaynaklı eksik kayıtlarını inceler; yalnız veri ve geçmiş test eşiği yeterliyse olasılığa uygulanır. Şüpheli veya incelenmemiş durum sağlıklı kabul edilmez.',
    'Kadro gücü oyuncu sayısı veya piyasa değeri değildir. Mevki yedeği ve yeni transferin etkisi doğrulanamadığında otomatik düzeltme yapılmaz. Avrupa yorgunluğu için ayrı nedensel düzeltme henüz yok.',
    'Yeni yükselen ve az maç verisi bulunan takımlar lig ortalamasından başlatılır; belirsizlik daha yüksektir.',
    'Modelin gol ortalamaları şut verisinden hesaplanan xG değildir.',
    'Eksik istatistikli 30 tarihsel kayıt ve doğrulanmış bir hükmen maç eğitim dışında tutulur; tüm hükmen maçlar henüz etiketlenmiş değildir.',
    'Sıra eşitliğinde tamamlanmış ikili/çoklu eşleşmeler, ardından genel averaj kullanılır. Tam eşitlikte önceki sıra korunur; bu sıra resmî karar değildir.',
    'Kaynak sayfaların ve açık kaynak kodun erişilebilirliği, verinin ticari yeniden kullanım hakkını tek başına doğrulamaz.'],
};
await mkdir(resolve(root, 'public/data'), { recursive: true });
await mkdir(resolve(root, 'data/predictions'), { recursive: true });
const currentSnapshot = snapshots.at(-1);
const digest = createHash('sha256').update(JSON.stringify({ version: MODEL_VERSION, season: current.season,
  table: currentSnapshot.table, projection: currentSnapshot.projection,
  squadVersion: SQUAD_VERSION,
  fixtures: currentSnapshot.fixtures.map(({ id, home, away, date, time, prediction, referee, squad }) => ({ id, home, away, date, time, prediction,
    squad: squad ? { applied: squad.applied, baseHome: squad.baseHome, candidateHome: squad.candidateHome,
      homeStatus: squad.home.status, awayStatus: squad.away.status, events: [squad.home.events, squad.away.events] } : null,
    referee: referee ? { id: referee.assignment?.referee?.id || null, candidateHome: referee.candidateHome, appliedShift: referee.appliedShift,
      homeMatches: referee.homeTeam?.matches, awayMatches: referee.awayTeam?.matches } : null })) })).digest('hex').slice(0, 12);
const archivePath = resolve(root, `data/predictions/${current.season}-week-${targetRound}-${digest}.json`);
try { await readFile(archivePath); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(archivePath, JSON.stringify({ generatedAt, sourceRetrievedAt: current.retrievedAt, modelVersion: MODEL_VERSION, ...currentSnapshot }), { flag: 'wx' });
}
console.log(JSON.stringify({ matches: matches.length, excluded: output.excludedCount, validation: { count: validation.count, model: validation.model },
  historicalWeeks: standingsHistory.seasons.reduce((sum, s) => sum + Object.keys(s.weeks).length, 0), reports: reports.length }, null, 2));
// Bütün hesaplar ve arşiv kaydı başarıyla bittikten sonra tek dosyalık yayın değiştirilir.
const outputPath = resolve(root, process.argv.includes('--candidate') ? 'public/data/dashboard.next.json' : 'public/data/dashboard.json');
await writeFile(outputPath + '.tmp', JSON.stringify(output));
await rename(outputPath + '.tmp', outputPath);
