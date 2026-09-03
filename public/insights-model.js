export function wilson(wins, count) {
  if (!Number.isInteger(count) || !Number.isInteger(wins) || wins < 0 || wins > count) throw new Error('Başarı/örnek sayısı geçersiz.');
  if (!count) return null;
  const z = 1.96, rate = wins / count, divisor = 1 + z * z / count;
  const center = (rate + z * z / (2 * count)) / divisor;
  const half = z * Math.sqrt(rate * (1 - rate) / count + z * z / (4 * count * count)) / divisor;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

export function calibrationSummary(records, team = '', season = '') {
  const rows = records.filter(r => (!team || r.home === team || r.away === team) && (!season || r.season === season));
  const correct = rows.reduce((s, r) => s + r.correct, 0);
  return { count: rows.length, correct, accuracy: rows.length ? correct / rows.length : null, interval: wilson(correct, rows.length),
    bins: Array.from({ length: 7 }, (_, i) => {
      const low = (i + 3) / 10;
      const part = rows.filter(r => Math.min(9, Math.floor((r.confidence + 1e-10) * 10)) === i + 3);
      const success = part.reduce((s, r) => s + r.correct, 0);
      return { low, count: part.length, confidence: part.length ? part.reduce((s, r) => s + r.confidence, 0) / part.length : null,
        accuracy: part.length ? success / part.length : null, interval: wilson(success, part.length) };
    }) };
}

export function seasonJourney(archive, season, team) {
  const entry = archive.seasons.find(s => s.season === season);
  return entry ? Array.from({ length: entry.maxRound }, (_, i) => ({ week: i + 1,
    row: entry.weeks[i + 1]?.rows.find(r => r.team === team) || null, source: entry.weeks[i + 1]?.source })) : [];
}

export function leadershipPattern(archive, mode, team = '') {
  const rows = archive.seasons.flatMap(season => {
    const week = mode === 'last-five' ? season.maxRound - 5 : 3;
    const leader = season.weeks[week]?.rows.find(r => r.rank === 1);
    const final = season.weeks[season.maxRound]?.rows;
    if (!leader || !final || (team && leader.team !== team)) return [];
    const finish = final.find(r => r.teamId === leader.teamId);
    return finish ? [{ season: season.season, week, team: leader.team, points: leader.points, finalRank: finish.rank,
      finalPoints: finish.points, source: season.weeks[week].source, finalSource: season.weeks[season.maxRound].source }] : [];
  });
  const wins = rows.filter(r => r.finalRank === 1).length;
  return { rows, count: rows.length, wins, rate: rows.length ? wins / rows.length : null, interval: wilson(wins, rows.length) };
}

export function europeanSummary(cases, mode, team = '') {
  const filtered = cases.filter(r => !team || r.team === team);
  const exposed = filtered.filter(r => mode === 'before' ? r.before : mode === 'after-away' ? r.after?.away : r.after);
  const controls = Map.groupBy(filtered.filter(r => !r.after && !r.before), r => `${r.cohort}:${r.home}`);
  // Aynı takım, sezon ve saha durumuyla eşleştirilir. Bu karşılaştırma nedensellik ölçmez.
  const paired = exposed.filter(r => controls.has(`${r.cohort}:${r.home}`));
  const controlIds = new Set(paired.flatMap(r => controls.get(`${r.cohort}:${r.home}`).map(c => `${c.cohort}:${c.date}`)));
  const wins = exposed.filter(r => r.points === 3).length;
  return { rows: exposed, count: exposed.length, wins, winRate: exposed.length ? wins / exposed.length : null,
    points: exposed.length ? exposed.reduce((s, r) => s + r.points, 0) / exposed.length : null,
    pairedCount: paired.length, controlCount: controlIds.size,
    pairedPoints: paired.length ? paired.reduce((s, r) => s + r.points, 0) / paired.length : null,
    controlPoints: paired.length ? paired.reduce((s, r) => {
      const part = controls.get(`${r.cohort}:${r.home}`); return s + part.reduce((a, c) => a + c.points, 0) / part.length;
    }, 0) / paired.length : null, interval: wilson(wins, exposed.length) };
}

export function criticalMatches(forecast, fixtures, metric = 'leader') {
  if (!['leader', 'top4', 'up'].includes(metric)) throw new Error('Bilinmeyen sıralama hedefi.');
  return (forecast?.conditional || []).flatMap(entry => {
    const match = fixtures.find(m => m.id === entry.id);
    const outcomes = Object.entries(entry.outcomes).filter(([, r]) => r.count >= 30 && r[metric] !== null);
    if (!match || outcomes.length < 2) return [];
    return [{ match, outcomes: outcomes.map(([outcome, r]) => ({ outcome, count: r.count, probability: r[metric] })),
      spread: Math.max(...outcomes.map(([, r]) => r[metric])) - Math.min(...outcomes.map(([, r]) => r[metric])) }];
  }).sort((a, b) => b.spread - a.spread);
}

export function readSharedState(params, data) {
  const team = (data.insightTeams || data.teams).some(t => t.name === params.get('team')) ? params.get('team') : null;
  const state = { team, round: data.targetRound, conditions: {}, notice: '' };
  if (!params.has('week') && !params.has('picks')) return state;
  const snapshot = data.snapshots.find(s => s.round === Number(params.get('week')));
  if (params.get('season') !== data.season || !snapshot) {
    state.notice = 'Bağlantıdaki sezon veya hafta bu görünümde yok. Güncel hafta açıldı; eski maç seçimleri uygulanmadı.'; return state;
  }
  state.round = snapshot.round;
  for (const pair of (params.get('picks') || '').split(',').filter(Boolean)) {
    const [id, outcome, extra] = pair.split(':');
    if (extra || !['H', 'D', 'A'].includes(outcome) || !snapshot.fixtures.some(m => m.id === id) || Object.hasOwn(state.conditions, id)) {
      state.conditions = {}; state.notice = 'Bağlantıdaki maç seçimleri geçersiz; PTnext tahmini açıldı.'; return state;
    }
    state.conditions[id] = outcome;
  }
  if (params.has('asof') && params.get('asof') !== snapshot.generatedAt) state.notice = 'Paylaşımdan sonra veri yenilenmiş. Senaryo bu haftanın güncel tahminleriyle hesaplandı.';
  return state;
}

export function scenarioUrl(origin, season, snapshot, team, conditions) {
  const url = new URL('/', origin);
  url.search = new URLSearchParams({ season, week: String(snapshot.round), team,
    picks: Object.entries(conditions).sort(([a], [b]) => a.localeCompare(b)).map(([id, pick]) => `${id}:${pick}`).join(','), asof: snapshot.generatedAt }).toString();
  url.hash = 'team-profile';
  return url.href;
}
