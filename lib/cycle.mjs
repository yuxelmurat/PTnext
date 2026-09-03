export const kickoff = match => match.date ? Date.parse(`${match.date}T${match.time || '00:00'}:00+03:00`) : NaN;

// Sonuçlar puan cetveline bir kez girer. Yeni tahmin, yalnızca kalan maçlara uygulanır.
export function weekCycle(fixtures) {
  const played = fixtures.filter(m => m.homeGoals !== null);
  const pending = fixtures.filter(m => m.homeGoals === null);
  const targetRound = pending.length ? Math.min(...pending.map(m => m.round)) : Math.max(...fixtures.map(m => m.round));
  if (played.some(m => m.round > targetRound)) throw new Error('Önceki haftadan ertelenmiş maç var. Hafta geçişi resmî takvimle incelenmeli; son geçerli yayın korunuyor.');
  const week = fixtures.filter(m => m.round === targetRound);
  if (!week.length || week.some(m => !Number.isFinite(kickoff(m)))) throw new Error('Hedef haftanın maç tarihleri eksik.');
  return { targetRound, played, pending: week.filter(m => m.homeGoals === null),
    status: !pending.length ? 'complete' : week.some(m => m.homeGoals !== null) ? 'in-progress' : 'upcoming' };
}
