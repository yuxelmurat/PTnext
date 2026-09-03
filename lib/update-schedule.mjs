import { kickoff } from './cycle.mjs';

// Tek Codex görevinin haftalık inceleme ve dört saatlik skor akışını ayırır.
export function scheduledTaskDecision(fixtures, now = new Date()) {
  const instant = new Date(now).getTime();
  if (!Number.isFinite(instant)) throw new Error('Kontrol zamanı geçersiz.');
  const local = new Date(instant + 3 * 3600000);
  if (local.getUTCDay() === 4 && local.getUTCHours() === 18) return { due: true, kind: 'squad', reason: 'Perşembe 18:00 kadro incelemesi' };
  if (local.getUTCHours() % 4 !== 0) return { due: false, kind: 'idle', reason: 'Dört saatlik skor kontrol saati değil; internet taraması yapılmadı' };
  const decision = scoreCheckDecision(fixtures, now);
  return { ...decision, kind: decision.due ? 'scores' : 'idle' };
}

// Bütün sınırlar Türkiye saatidir; sunucunun yerel saat dilimine bağlı değildir.
export function scoreCheckDecision(fixtures, now = new Date()) {
  const instant = new Date(now).getTime();
  if (!Number.isFinite(instant)) throw new Error('Kontrol zamanı geçersiz.');
  const local = new Date(instant + 3 * 3600000);
  const day = local.getUTCDay(), hour = local.getUTCHours();
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 3 * 3600000;
  const friday = midnight - ((day + 2) % 7) * 86400000;
  const weekendStart = friday + 20 * 3600000, weekendEnd = friday + 4 * 86400000;
  const weekend = instant >= weekendStart && instant <= weekendEnd;
  const weekendMatches = fixtures.filter(m => {
    const time = kickoff(m);
    return Number.isFinite(time) && time >= friday && time < weekendEnd;
  });
  if (weekend && weekendMatches.length) return { due: true, reason: 'Hafta sonu maç penceresi', matchIds: weekendMatches.map(m => m.id) };
  // Hafta içi maçının bir önceki dört saatlik kontrolünden sonrasındaki altı saate kadar.
  const nearby = fixtures.filter(m => {
    const time = kickoff(m);
    const matchDay = new Date(time + 3 * 3600000).getUTCDay();
    return [2, 3, 4].includes(matchDay) && Number.isFinite(time) && instant >= time - 4 * 3600000 && instant <= time + 6 * 3600000;
  });
  return { due: nearby.length > 0, reason: nearby.length ? 'Fikstürde hafta içi veya erken başlayan maç var' : 'Maç penceresi dışında; internet taraması yapılmadı', matchIds: nearby.map(m => m.id), localHour: hour };
}
