import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createModel, learnDay, fromMeans, emptyTable, applyScore, rankTable, simulate, selectScore, projectTable } from '../public/model.js';
import { weekCycle } from '../lib/cycle.mjs';
import { csv, canonicalTeam, loadData, seasonFor } from '../lib/data.mjs';
import { parseTff } from '../lib/tff.mjs';

test('Skor olasılıkları tam bir dağılım oluşturur', () => {
  for (const [h, a] of [[0.2, 0.2], [1.5, 1.1], [4.5, 4.5]]) {
    const p = fromMeans(h, a);
    assert.ok(Math.abs(p.home + p.draw + p.away - 1) < 1e-10);
    assert.ok(Math.abs(p.scores.reduce((s, v) => s + v.p, 0) - 1) < 1e-10);
    assert.ok(p.btts >= 0 && p.btts <= 1);
  }
});
test('Aynı günün sonuçları birbirinin tahminine sızmaz', () => {
  const matches = [{ season: '2025-2026', home: 'A', away: 'B', homeGoals: 0, awayGoals: 1 }, { season: '2025-2026', home: 'C', away: 'D', homeGoals: 0, awayGoals: 0 }];
  const changed = structuredClone(matches); changed[0].homeGoals = 8;
  assert.deepEqual(learnDay(createModel(), matches), learnDay(createModel(), changed));
});
test('Beraberlik iki, galibiyet toplam üç puan dağıtır ve gol dengesi korunur', () => {
  const table = emptyTable(['A', 'B']);
  applyScore(table, { home: 'A', away: 'B', homeGoals: 2, awayGoals: 2 });
  applyScore(table, { home: 'B', away: 'A', homeGoals: 0, awayGoals: 1 });
  assert.equal(table.reduce((s, t) => s + t.points, 0), 5);
  assert.equal(table.reduce((s, t) => s + t.gf - t.ga, 0), 0);
  assert.throws(() => applyScore(table, { home: 'A', away: 'B' }, -1, 0));
});
test('Kesin sonuç senaryosu rakiplere çelişen puan vermez', () => {
  const fixture = { id: 'derbi', home: 'A', away: 'B', prediction: fromMeans(1.5, 1.1) };
  const base = emptyTable(['A', 'B']);
  for (const outcome of ['H', 'D', 'A']) {
    const result = simulate(base, [fixture], { runs: 100, conditions: { derbi: outcome } });
    assert.ok(Math.abs(result.find(t => t.team === 'A').expectedPoints - ({ H: 3, D: 1, A: 0 })[outcome]) < 1e-10);
    assert.ok(Math.abs(result.find(t => t.team === 'B').expectedPoints - ({ H: 0, D: 1, A: 3 })[outcome]) < 1e-10);
    assert.ok(Math.abs(result.reduce((s, t) => s + t.leader, 0) - 1) < 1e-10);
  }
  assert.deepEqual(base, emptyTable(['A', 'B']));
});
test('Tamamlanmış ikili averaj genel averajdan önce gelir', () => {
  const table = emptyTable(['A', 'B', 'C']);
  Object.assign(table[0], { points: 10, gd: -5 }); Object.assign(table[1], { points: 10, gd: 8 });
  const mutual = [{ home: 'A', away: 'B', homeGoals: 2, awayGoals: 0 }, { home: 'B', away: 'A', homeGoals: 1, awayGoals: 1 }];
  assert.equal(rankTable(table, mutual)[0].team, 'A');
  assert.equal(rankTable(table, mutual.slice(0, 1))[0].team, 'B');
});
test('CSV alıntıları, pandemi sezonu ve sponsor adları doğru ayrılır', () => {
  assert.deepEqual(csv('a,b\n"x,y","iki ""tırnak"""\n'), [{ a: 'x,y', b: 'iki "tırnak"' }]);
  assert.throws(() => csv('a,b\n1,2,3'));
  assert.equal(seasonFor('2020-07-25'), '2019-2020');
  assert.equal(canonicalTeam('REEDER SAMSUNSPOR'), canonicalTeam('SAMSUNSPOR A.Ş.'));
  assert.equal(canonicalTeam('ANTALYASPOR A.Ş.'), 'Antalyaspor');
});
test('Tahmini galibiyet 7 puanı 10 yapar; rakibe puan yazılmaz ve bay geçen değişmez', () => {
  const base = emptyTable(['Galatasaray', 'Başakşehir', 'Bay']);
  Object.assign(base[0], { points: 7, played: 3 });
  Object.assign(base[1], { points: 4, played: 3 });
  const fixture = { id: 'gs', home: 'Başakşehir', away: 'Galatasaray', prediction: fromMeans(0.8, 2) };
  const result = projectTable(base, [fixture]);
  assert.equal(result.table.find(t => t.team === 'Galatasaray').points, 10);
  assert.equal(result.table.find(t => t.team === 'Galatasaray').played, 4);
  assert.equal(result.table.find(t => t.team === 'Başakşehir').points, 4);
  assert.equal(result.table.find(t => t.team === 'Bay').played, 0);
  assert.equal(base[0].points, 7);
  assert.ok(result.table.every(t => Number.isInteger(t.points)));
  assert.equal(result.table.reduce((s, t) => s + t.gf - t.ga, 0), 0);
});
test('Sonuç tercihi tek en olası skordan farklıysa seçilen skor galibiyetle tutarlıdır', () => {
  const probabilities = fromMeans(1.99, 1.29);
  assert.equal(probabilities.likelyScore, '1-1');
  const pick = selectScore(probabilities);
  assert.equal(pick.outcome, 'H');
  assert.ok(pick.homeGoals > pick.awayGoals);
});
test('Beraberlik senaryosu iki tarafa birer puan verir, gerçekleşen maç tekrar eklenmez', () => {
  const played = { id: 'old', home: 'A', away: 'B', homeGoals: 2, awayGoals: 0 };
  const base = emptyTable(['A', 'B']); applyScore(base, played);
  const next = { id: 'next', home: 'B', away: 'A', prediction: fromMeans(1.7, 1) };
  const result = projectTable(base, [played, next], { playedMatches: [played], conditions: { next: 'D' } });
  assert.equal(result.table.find(t => t.team === 'A').points, 4);
  assert.equal(result.table.find(t => t.team === 'B').points, 1);
  assert.ok(result.table.every(t => t.played === 2));
  assert.throws(() => projectTable(base, [next, next]));
  assert.throws(() => projectTable(base, [next], { conditions: { old: 'H' } }));
});
test('Hafta otomatik ilerler, yarım haftada yalnız kalan maçlar tahmin edilir', () => {
  const matches = [
    { id: 'a', round: 4, date: '2026-09-04', time: '20:00', homeGoals: null, awayGoals: null },
    { id: 'b', round: 4, date: '2026-09-05', time: '20:00', homeGoals: null, awayGoals: null },
    { id: 'c', round: 5, date: '2026-09-11', time: '20:00', homeGoals: null, awayGoals: null },
  ];
  assert.equal(weekCycle(matches).targetRound, 4);
  matches[0].homeGoals = 1; matches[0].awayGoals = 2;
  assert.equal(weekCycle(matches).status, 'in-progress');
  assert.deepEqual(weekCycle(matches).pending.map(m => m.id), ['b']);
  matches[1].homeGoals = 0; matches[1].awayGoals = 0;
  assert.equal(weekCycle(matches).targetRound, 5);
  matches[2].homeGoals = 1; matches[2].awayGoals = 1;
  assert.equal(weekCycle(matches).status, 'complete');
  assert.equal(weekCycle(matches).pending.length, 0);
  matches[0].homeGoals = null; matches[0].awayGoals = null;
  assert.throws(() => weekCycle(matches), /ertelenmiş/);
});
test('Kaynak ve istemci aynı tam puan tahminini üretir', async () => {
  const output = JSON.parse(await readFile(resolve(import.meta.dirname, '..', process.env.PTNEXT_DASHBOARD || 'public/data/dashboard.json'), 'utf8'));
  for (const snapshot of output.snapshots) {
    assert.deepEqual(projectTable(snapshot.table, snapshot.fixtures, { playedMatches: snapshot.playedMatches }), snapshot.projection);
    assert.ok(snapshot.projection.table.every(t => Number.isInteger(t.points)));
  }
});
test('Yeni haftanın başlangıcı önceki tahmin değil gerçekleşen puandır', () => {
  const base = emptyTable(['GS', 'Rakip']);
  base[0].points = 7;
  const fourth = { id: '4', home: 'GS', away: 'Rakip', prediction: fromMeans(2.2, 0.6) };
  assert.equal(projectTable(base, [fourth]).table.find(t => t.team === 'GS').points, 10);
  const actual = { ...fourth, homeGoals: 1, awayGoals: 1 };
  applyScore(base, actual);
  const fifth = { ...fourth, id: '5' };
  assert.equal(projectTable(base, [fifth], { playedMatches: [actual] }).table.find(t => t.team === 'GS').points, 11);
});
test('Gerçek TFF kaydı: tam fikstür, tamamlanmış haftalar ve resmî puanlar tutarlı', async () => {
  const html = await readFile(new URL('../data/research/tff/current.html', import.meta.url), 'utf8');
  const parsed = parseTff(html);
  assert.equal(parsed.fixtures.length, parsed.standings.length * (parsed.standings.length - 1));
  assert.throws(() => parseTff(html.replace('fiksturListesiTable', 'broken-table')));
  const data = await loadData(resolve(import.meta.dirname, '..'));
  const table = emptyTable(data.current.standings.map(t => t.team));
  data.current.fixtures.filter(m => m.homeGoals !== null).forEach(m => applyScore(table, m));
  for (const actual of data.current.standings) {
    const computed = table.find(t => t.team === actual.team);
    for (const key of ['played', 'points', 'gf', 'ga', 'won', 'drawn', 'lost']) assert.equal(computed[key], actual[key], `${actual.team}: ${key}`);
  }
  assert.equal(data.matches.find(m => m.id === '264193').excluded, true);
});
