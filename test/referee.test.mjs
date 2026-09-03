import test from 'node:test';
import assert from 'node:assert/strict';
import { refereeAnalysis, adjustedPrediction, refereeValidation, wilson } from '../lib/referee.mjs';
import { parseReferee } from '../lib/tff.mjs';
import { fromMeans } from '../public/model.js';

const assignment = { referee: { id: 'r1', name: 'Test Hakemi' } };
function history() {
  return ['A', 'B'].flatMap(team => Array.from({ length: 20 }, (_, i) => ({
    id: `${team}${i}`, refereeId: 'r1', date: '2025-01-01', home: team, away: 'Rakip',
    homeGoals: i < (team === 'A' ? 12 : 17) ? 1 : 0, awayGoals: 0,
    baseline: { home: team === 'A' ? 0.3 : 0.9, draw: 0.05, away: team === 'A' ? 0.65 : 0.05 },
  })));
}
test('Orta hakem VAR ve yardımcıdan ayrı okunur; boş atama sıfır performans değildir', () => {
  const html = '<div class="dtMacBilgisiHakemler"><a href="?hakemId=1">ORTA(Hakem)</a><a href="?hakemId=2">VAR(VAR)</a><a href="?hakemId=3">YAN(1. Yardımcı Hakem)</a></div>';
  const parsed = parseReferee(html, { id: 'match' });
  assert.equal(parsed.referee.id, '1');
  assert.equal(parsed.crew.length, 3);
  assert.equal(parseReferee('<div class="dtMacBilgisiHakemler"></div>', { id: 'match' }).referee, null);
  assert.throws(() => parseReferee('Erişim reddedildi', { id: 'match' }));
});
test('Yüksek ham kazanma oranı otomatik lehte düzeltme oluşturmaz', () => {
  const result = refereeAnalysis(history(), assignment, 'A', 'B', '2025-02-01');
  assert.equal(result.homeTeam.winRate, 0.6);
  assert.equal(result.awayTeam.winRate, 0.85);
  assert.ok(result.shift > 0, 'A beklentisini aşarken B beklentisinin altında; ham oran sıralaması tersine çevrilir.');
  assert.ok(result.shift <= 0.05);
});
test('Gelecekteki sonuç ve başka hakemin maçları analize sızmaz', () => {
  const original = history();
  const augmented = [...original, { ...original[0], date: '2025-03-01' }, { ...original[0], refereeId: 'r2' }];
  assert.deepEqual(refereeAnalysis(original, assignment, 'A', 'B', '2025-02-01'), refereeAnalysis(augmented, assignment, 'A', 'B', '2025-02-01'));
});
test('Az örnekte veya atama yokken temel tahmin değişmez', () => {
  const base = fromMeans(1.8, 1);
  for (const a of [refereeAnalysis([], assignment, 'A', 'B', '2025-02-01'), refereeAnalysis(history(), null, 'A', 'B', '2025-02-01')]) {
    assert.equal(a.eligible, false);
    assert.equal(adjustedPrediction(base, a), base);
  }
  assert.equal(wilson(0, 0), null);
  assert.ok(wilson(1, 1).low < 0.3);
});
test('Aday düzeltme sonucu ve skor dağılımı aynı olasılıkları taşır', () => {
  const base = fromMeans(1.8, 1.2);
  const result = adjustedPrediction(base, refereeAnalysis(history(), assignment, 'A', 'B', '2025-02-01'));
  assert.ok(Math.abs(result.home + result.draw + result.away - 1) < 1e-10);
  for (const [key, outcome] of [['home', 'H'], ['draw', 'D'], ['away', 'A']]) {
    assert.ok(Math.abs(result[key] - result.scores.filter(s => s.outcome === outcome).reduce((sum, s) => sum + s.p, 0)) < 1e-10);
  }
  assert.equal(result.draw, base.draw);
});
test('Hakem düzeltmesi kanıt eşiği aşılmadan kullanıma açılmaz', () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ eligible: true, season: '2025-2026', round: Math.floor(i / 4) + 1,
    base: { brier: 0.6, logLoss: 1 }, candidate: { brier: 0.59, logLoss: 0.99 } }));
  assert.equal(refereeValidation(rows, 80).approved, true);
  assert.equal(refereeValidation(rows.slice(0, 20), 80).approved, false);
  assert.equal(refereeValidation(rows.map(r => ({ ...r, candidate: { brier: 0.61, logLoss: 1.01 } })), 80).approved, false);
  assert.equal(refereeValidation([], 0).approved, false);
});
