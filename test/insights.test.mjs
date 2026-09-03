import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { simulate, emptyTable, fromMeans } from '../public/model.js';
import { calibrationSummary, seasonJourney, leadershipPattern, europeanSummary, criticalMatches, readSharedState, scenarioUrl } from '../public/insights-model.js';
import { parseEuropeanMatches } from '../lib/europe.mjs';
import { europeanCases, weeklyReports, compareReport } from '../lib/insights.mjs';
import { kickoff } from '../lib/cycle.mjs';

const dashboard = JSON.parse(await readFile(process.env.PTNEXT_DASHBOARD || 'public/data/dashboard.json', 'utf8'));

test('Koşullu simülasyon ana dağılımı değiştirmez; ağırlıklı sonuçlar ana olasılığı verir', () => {
  const table = emptyTable(['A', 'B', 'C', 'D']);
  const fixtures = [{ id: 'ab', home: 'A', away: 'B', prediction: fromMeans(1.6, 1.2) }, { id: 'cd', home: 'C', away: 'D', prediction: fromMeans(1, 1) }];
  const base = simulate(table, fixtures, { runs: 1500, seed: 7 });
  const detailed = simulate(table, fixtures, { runs: 1500, seed: 7, collectConditions: true });
  for (const row of detailed) {
    assert.deepEqual(row.ranks, base.find(r => r.team === row.team).ranks);
    for (const match of row.conditional) {
      assert.equal(Object.values(match.outcomes).reduce((s, r) => s + r.count, 0), 1500);
      for (const key of ['leader', 'top4', 'up', 'expectedRank']) {
        const weighted = Object.values(match.outcomes).reduce((s, r) => s + r.count * r[key], 0) / 1500;
        assert.ok(Math.abs(weighted - row[key]) < 1e-10);
      }
    }
  }
  const locked = simulate(table, fixtures, { runs: 500, conditions: { ab: 'H' }, collectConditions: true });
  assert.equal(locked[0].conditional[0].outcomes.D.count, 0);
  assert.equal(locked[0].conditional[0].outcomes.D.leader, null);
  assert.ok(criticalMatches(locked[0], fixtures).every(m => m.match.id !== 'ab'));
});

test('Kalibrasyon filtresi maçları iki kez saymaz; boş veri başarı sayılmaz', () => {
  const rows = [
    { season: 'a', home: 'A', away: 'B', confidence: .6, correct: 1 },
    { season: 'a', home: 'B', away: 'C', confidence: .5, correct: 0 },
    { season: 'b', home: 'A', away: 'C', confidence: 1, correct: 1 },
  ];
  assert.equal(calibrationSummary(rows, 'A', 'a').count, 1);
  assert.equal(calibrationSummary(rows, 'B', 'a').accuracy, .5);
  assert.equal(calibrationSummary(rows, 'A', 'b').bins.at(-1).count, 1);
  assert.equal(calibrationSummary(rows, 'Z').accuracy, null);
  assert.equal(calibrationSummary(rows).bins.reduce((s, b) => s + b.count, 0), 3);
});

test('Sezon eğrisi eksik haftayı ve sezon uzunluğunu korur', () => {
  const archive = { seasons: [{ season: 'a', maxRound: 4, weeks: { 1: { rows: [{ team: 'A', rank: 3, points: 0 }] }, 3: { rows: [{ team: 'A', rank: 1, points: 6 }] } } }] };
  const series = seasonJourney(archive, 'a', 'A');
  assert.equal(series.length, 4);
  assert.equal(series[1].row, null);
  assert.equal(series[2].row.rank, 1);
  assert.ok(seasonJourney(archive, 'a', 'B').every(p => p.row === null));
});

test('Son beş haftaya giriş 34 haftada 29, 38 haftada 33. cetveli kullanır', () => {
  const archive = { seasons: [34, 38].map(maxRound => ({ season: String(maxRound), maxRound, weeks: {
    [maxRound - 5]: { rows: [{ team: 'A', teamId: '1', rank: 1, points: 60 }], source: 'start' },
    [maxRound]: { rows: [{ team: 'A', teamId: '1', rank: maxRound === 34 ? 1 : 2, points: 70 }], source: 'end' },
  } })) };
  const result = leadershipPattern(archive, 'last-five');
  assert.deepEqual(result.rows.map(r => r.week), [29, 33]);
  assert.equal(result.wins, 1); assert.equal(result.rate, .5);
  assert.equal(leadershipPattern(archive, 'last-five', 'B').rate, null);
});

test('Avrupa tarihleri grup başına yıl devretmez; iç saha/deplasman ayrılır', () => {
  const text = '= UEFA\n  Thu Dec 14 2023\n    21:00 Galatasaray (TUR) v Other (GER) 2-1\n  Thu Feb 1\n    Other (GER) v Galatasaray (TUR) 1-1\n  Thu Sep 21\n    Fenerbahçe (TUR) v Other (GRE) 2-1\n';
  const rows = parseEuropeanMatches(text, '2023-2024', 'el', 'https://example.org');
  assert.deepEqual(rows.map(r => r.date), ['2023-12-14', '2024-02-01', '2023-09-21']);
  assert.deepEqual(rows.map(r => r.away), [false, true, false]);
  assert.throws(() => parseEuropeanMatches('   Galatasaray (TUR) v Other (GRE) 2-1', '2023-2024', 'el', 'source'));
});

test('Avrupa öncesi/sonrası 1–4 günle sınırlı, tek lig maçı yinelenmez', () => {
  const europe = { matches: [{ team: 'A', season: 's', date: '2024-02-10', away: true }, { team: 'A', season: 's', date: '2024-02-13', away: false }] };
  const matches = ['2024-02-06', '2024-02-11', '2024-02-18'].map((date, i) => ({ season: 's', date, home: 'A', away: 'B', homeGoals: i, awayGoals: 0 }));
  const rows = europeanCases(europe, matches).cases;
  assert.equal(rows.length, 3); assert.ok(rows[0].before); assert.ok(rows[1].after && rows[1].before);
  assert.equal(rows[2].after, null);
  assert.equal(europeanSummary(rows, 'after-away', 'A').count, 1);
  assert.equal(europeanSummary(rows, 'before', 'A').count, 2);
});

test('Avrupa karşılaştırması başka takım, sezon veya sahanın kontrolünü karıştırmaz', () => {
  const rows = [
    { team: 'A', cohort: 's:A', home: true, date: '1', points: 0, after: { away: true } },
    { team: 'A', cohort: 's:A', home: true, date: '2', points: 3 },
    { team: 'A', cohort: 's:A', home: false, date: '3', points: 0 },
    { team: 'B', cohort: 's:B', home: true, date: '4', points: 0 },
  ];
  const result = europeanSummary(rows, 'after-away');
  assert.equal(result.pairedPoints, 0); assert.equal(result.controlPoints, 3); assert.equal(result.controlCount, 1);
});

test('Senaryo bağlantısı takım, hafta ve seçimleri taşır; eski veya bozuk seçimler uygulanmaz', () => {
  const data = { season: '2026-2027', targetRound: 4, teams: [{ name: 'A' }], snapshots: [{ round: 4, generatedAt: 'now', fixtures: [{ id: 'a' }] }] };
  const url = scenarioUrl('https://example.org', data.season, data.snapshots[0], 'A', { a: 'D' });
  const params = new URL(url).searchParams;
  assert.deepEqual(readSharedState(params, data).conditions, { a: 'D' });
  params.set('picks', 'a:H,a:D'); assert.deepEqual(readSharedState(params, data).conditions, {});
  params.set('picks', 'a:X'); assert.match(readSharedState(params, data).notice, /geçersiz/);
  params.set('season', '2025-2026'); assert.match(readSharedState(params, data).notice, /eski maç seçimleri uygulanmadı/);
});

test('Haftalık karne tahmini veya gerçekleşen cetveli değiştirmez', () => {
  const predicted = [{ team: 'A', rank: 1, points: 10 }, { team: 'B', rank: 2, points: 7 }];
  const actual = [{ team: 'B', rank: 1, points: 10 }, { team: 'A', rank: 2, points: 8 }];
  const before = JSON.stringify([predicted, actual]);
  const report = compareReport(predicted, actual);
  assert.equal(report.meanRankError, 1); assert.equal(report.rows[1].pointsError, 2);
  assert.equal(JSON.stringify([predicted, actual]), before);
});

test('Maç öncesi kayıt karneye sabit girer; geç veya tutarsız zaman damgası reddedilir', async t => {
  const root = await mkdtemp(resolve('test/.report-'));
  try {
    const current = JSON.parse(await readFile(`data/normalized/${dashboard.season}.json`, 'utf8'));
    const snapshot = structuredClone(dashboard.snapshots.find(s => current.fixtures.filter(m => m.round === s.round).every(m => m.homeGoals !== null)));
    if (!snapshot) { t.skip('Henüz tamamlanmış hafta yok.'); return; }
    const round = snapshot.round;
    await mkdir(resolve(root, 'data/predictions'), { recursive: true });
    await mkdir(resolve(root, 'data/research/tff'), { recursive: true });
    await copyFile(`data/research/tff/current-week-${round}.html`, resolve(root, `data/research/tff/current-week-${round}.html`));
    const generatedAt = new Date(Math.min(...current.fixtures.filter(m => m.round === round).map(kickoff)) - 86400000).toISOString();
    snapshot.generatedAt = generatedAt;
    const path = resolve(root, `data/predictions/${dashboard.season}-week-${round}-opening-v2.json`);
    await writeFile(path, JSON.stringify({ generatedAt, snapshot }));
    const before = await readFile(path, 'utf8');
    const result = await weeklyReports(root, current, [snapshot]);
    assert.equal(result[0].kind, 'recorded'); assert.equal(result[0].completed, true);
    assert.equal(await readFile(path, 'utf8'), before);
    await writeFile(path, JSON.stringify({ generatedAt: new Date(Math.min(...current.fixtures.filter(m => m.round === round).map(kickoff))).toISOString(), snapshot }));
    await assert.rejects(weeklyReports(root, current, [snapshot]), /maç öncesi zamanı/);
  } finally {
    if (!resolve(root).startsWith(resolve('test') + sep)) throw new Error('Test temizliği çalışma alanı dışında.');
    await rm(root, { recursive: true, force: true });
  }
});

test('Yayınlanan kartların arşiv, karne ve kalibrasyon kapsamı kaynakla tutarlı', () => {
  for (const season of dashboard.standingsHistory.seasons) assert.equal(Object.keys(season.weeks).length, season.maxRound);
  assert.equal(dashboard.validation.records.length, dashboard.validation.count);
  const all = calibrationSummary(dashboard.validation.records);
  assert.ok(Math.abs(all.accuracy - dashboard.validation.model.accuracy) < 1e-12);
  assert.ok(dashboard.europe.matches.length > 0);
  assert.equal(new Set(dashboard.europe.matches.map(m => `${m.team}:${m.date}`)).size, dashboard.europe.matches.length);
  for (const report of dashboard.reports) {
    if (report.completed) assert.ok(report.rows.length >= 16 && Number.isFinite(report.meanRankError));
    else assert.equal(report.rows.length, 0);
  }
});
