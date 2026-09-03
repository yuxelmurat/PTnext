import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSquadModel, learnLineup, lineupEffect, squadPrediction, expectedSquad, validateSquadReview, parseLineup } from '../lib/squad.mjs';
import { fromMeans } from '../public/model.js';
import { scoreCheckDecision, scheduledTaskDecision } from '../lib/update-schedule.mjs';

const now = Date.parse('2026-09-03T18:00:00+03:00');
const fixture = { id: 'm', season: '2026-2027', date: '2026-09-06', time: '20:00', home: 'A', away: 'B' };
const base = fromMeans(1.8, 1.1);
const players = Array.from({ length: 13 }, (_, i) => ({ id: String(i + 1), name: `Oyuncu ${i + 1}`, starter: i < 11 }));
const record = { home: { team: 'A', players }, away: { team: 'B', players }, source: 'https://www.tff.org/Default.aspx?pageId=29&macId=1' };
function trained() {
  const model = createSquadModel();
  for (let i = 0; i < 20; i++) learnLineup(model, { ...fixture, date: '2026-08-30', homeGoals: 2, awayGoals: 1 }, record, base);
  return model;
}
const review = () => ({ schemaVersion: 1, season: fixture.season, teams: [{ team: 'A', matchIds: ['m'], status: 'reviewed', checkedAt: new Date(now).toISOString(), sources: ['https://www.tff.org/'] }], events: [] });
const event = (playerId = '1', replacementId = '12') => ({ matchId: 'm', team: 'A', playerId, playerName: `Oyuncu ${playerId}`, status: 'out', reason: 'injury', publishedAt: new Date(now - 3600000).toISOString(), checkedAt: new Date(now).toISOString(), validUntil: '2026-09-07T00:00:00+03:00', source: 'https://www.tff.org/', evidence: 'Test amaçlı oyuncu durum kanıtı.', replacementId, position: 'FWD', replacementPosition: 'FWD', replacementSource: 'https://www.tff.org/', replacementEvidence: 'Test amaçlı aynı pozisyon kanıtı.' });

test('Kadro yeterli geçmiş ve ilgili maç için güncel inceleme ister', () => {
  const model = trained(), r = review();
  assert.equal(expectedSquad(model, 'A', fixture, r, now).effect.eligible, true);
  assert.equal(expectedSquad(model, 'A', { ...fixture, id: 'next' }, r, now).effect.eligible, false);
  assert.equal(expectedSquad(model, 'A', fixture, r, now + 121 * 3600000).effect.eligible, false);
  assert.equal(expectedSquad(model, 'A', { ...fixture, season: '2027-2028' }, r, now).status, 'no-current-lineup');
  assert.equal(lineupEffect(createSquadModel(), 'A', players.slice(0, 11).map(p => p.id)).eligible, false);
});

test('Aynı yedek iki eksiği dolduramaz; doğrulanmış iki farklı alternatif birlikte değerlendirilir', () => {
  const r = review(); r.events = [event(), event('2', '12')];
  const duplicate = expectedSquad(trained(), 'A', fixture, r, now);
  assert.equal(duplicate.expectedXI.length, 10);
  assert.equal(duplicate.effect.eligible, false);
  r.events[1] = { ...event('2', '13'), position: 'GK', replacementPosition: 'GK' };
  const combined = expectedSquad(trained(), 'A', fixture, r, now);
  assert.equal(combined.expectedXI.length, 11);
  assert.equal(combined.replacements.length, 2);
  assert.ok(!combined.expectedXI.some(p => ['1', '2'].includes(p.id)));
  assert.equal(combined.effect.eligible, true);
});

test('Eski eksik kaydı sessizce sağlıklıya dönüşmez; şüpheli ve bilinmeyen oyuncu düzeltmeyi kapatır', () => {
  for (const patch of [{ checkedAt: new Date(now - 121 * 3600000).toISOString() }, { validUntil: new Date(now + 3600000).toISOString() }, { status: 'doubtful' }, { playerId: '999' }]) {
    const r = review(); r.events = [{ ...event(), ...patch }];
    assert.equal(expectedSquad(trained(), 'A', fixture, r, now).effect.eligible, false);
  }
});

test('Oyuncu sayısı ve saha dışındaki yeni yedekler kendiliğinden kalite puanı kazandırmaz', () => {
  const model = trained(), ids = players.slice(0, 11).map(p => p.id), original = lineupEffect(model, 'A', ids);
  for (let i = 20; i < 25; i++) model.teams.A.players[i] = { starts: 0, attack: 0, defence: 0, variance: 0 };
  assert.deepEqual(lineupEffect(model, 'A', ids), original);
  assert.equal(lineupEffect(model, 'A', Array(11).fill('1')).eligible, false);
});

test('Birleşik hücum/savunma etkisi normalize bir skor dağılımı üretir; kanıt yoksa temel dağılım aynıdır', () => {
  const result = squadPrediction(base, { eligible: true, attack: -0.15, defence: 0.12 }, { eligible: true, attack: 0, defence: 0 });
  assert.ok(result.home < base.home);
  assert.ok(Math.abs(result.home + result.draw + result.away - 1) < 1e-10);
  for (const [key, outcome] of [['home', 'H'], ['draw', 'D'], ['away', 'A']]) assert.ok(Math.abs(result[key] - result.scores.filter(s => s.outcome === outcome).reduce((sum, s) => sum + s.p, 0)) < 1e-10);
  assert.equal(squadPrediction(base, { eligible: false }, { eligible: true }), base);
});

test('Kaynak, pozisyon, zaman ve maç-takım uyuşmazlığı içe aktarılmadan reddedilir', () => {
  const good = review(); good.events = [event()];
  assert.equal(validateSquadReview(good, [fixture], now), good);
  assert.throws(() => validateSquadReview({ ...good, season: '2025-2026' }, [fixture], now));
  for (const patch of [{ source: 'http://example.com' }, { evidence: ' '.repeat(20) }, { replacementPosition: 'GK' }, { team: 'Başka' }, { publishedAt: '2026-10-01T00:00:00Z' }]) {
    const r = review(); r.events = [{ ...event(), ...patch }];
    assert.throws(() => validateSquadReview(r, [fixture], now));
  }
  const r = review(); r.events = [event(), event()];
  assert.throws(() => validateSquadReview(r, [fixture], now));
});

test('Eksik TFF ilk 11 tam kadro kabul edilmez', () => {
  assert.equal(parseLineup('Kadro henüz açıklanmadı', fixture), null);
  const html = '<a id="x_grdTakim1_rptKadrolar_0_lnkOyuncu" href="?kisiId=1">A</a>';
  assert.throws(() => parseLineup(html, fixture));
});

test('Türkiye saatine göre cuma 20 başlangıcı ve salı 00 son kontrolü', () => {
  const weekend = [fixture];
  for (const [date, due] of [['2026-09-04T19:59:59+03:00', false], ['2026-09-04T20:00:00+03:00', true], ['2026-09-07T23:59:59+03:00', true], ['2026-09-08T00:00:00+03:00', true], ['2026-09-08T00:00:01+03:00', false], ['2026-09-08T04:00:00+03:00', false]]) assert.equal(scoreCheckDecision(weekend, date).due, due, date);
  assert.equal(scoreCheckDecision([], '2026-09-05T20:00:00+03:00').due, false);
});

test('Hafta içi maç varsa yalnız çevresindeki dört saatlik kontroller çalışır', () => {
  const fixtures = [{ ...fixture, date: '2026-09-09', time: '21:00' }];
  for (const [date, due] of [['2026-09-09T16:00:00+03:00', false], ['2026-09-09T20:00:00+03:00', true], ['2026-09-10T00:00:00+03:00', true], ['2026-09-10T04:00:00+03:00', false]]) assert.equal(scoreCheckDecision(fixtures, date).due, due, date);
});

test('Tek otomasyon perşembe kadro işini ayırır; diğer günlerin 18 kontrolünde tarama yapmaz', () => {
  assert.equal(scheduledTaskDecision([], '2026-09-03T18:00:00+03:00').kind, 'squad');
  assert.equal(scheduledTaskDecision([fixture], '2026-09-05T18:00:00+03:00').kind, 'idle');
  assert.equal(scheduledTaskDecision([fixture], '2026-09-04T20:00:00+03:00').kind, 'scores');
  assert.equal(scheduledTaskDecision([], '2026-09-09T20:00:00+03:00').due, false);
});

test('Yayımlanacak tahmin doğrulama ve iki takımın kadro eşiklerini atlayamaz', async () => {
  const dashboard = JSON.parse(await readFile(process.env.PTNEXT_DASHBOARD || 'public/data/dashboard.json', 'utf8'));
  for (const match of dashboard.snapshots.at(-1).fixtures) {
    if (match.squad?.applied) {
      assert.equal(dashboard.squadValidation.approved, true);
      assert.equal(match.squad.home.effect.eligible, true);
      assert.equal(match.squad.away.effect.eligible, true);
      assert.equal(match.referee?.applied, false, 'Ayrıca doğrulanmamış iki düzeltme birleştirilmez.');
    }
  }
});
