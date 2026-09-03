// Hakemle takım performansı arasındaki ilişkiyi ölçer; karar hatası veya kayırma ölçmez.
export const REFEREE_CONFIG = Object.freeze({ minimumTeamMatches: 8, minimumRefereeMatches: 30, priorMatches: 30, maximumShift: 0.05, minimumValidationMatches: 60 });

import { wilson } from '../public/insights-model.js';
export { wilson };

function teamSummary(matches, team) {
  const rows = matches.filter(m => m.home === team || m.away === team);
  const summarize = list => {
    let wins = 0, draws = 0, expectedWins = 0;
    for (const m of list) {
      const home = m.home === team;
      wins += Number(home ? m.homeGoals > m.awayGoals : m.awayGoals > m.homeGoals);
      draws += Number(m.homeGoals === m.awayGoals);
      expectedWins += home ? m.baseline.home : m.baseline.away;
    }
    return { matches: list.length, wins, draws, losses: list.length - wins - draws,
      winRate: list.length ? wins / list.length : null, interval: wilson(wins, list.length),
      expectedWinRate: list.length ? expectedWins / list.length : null,
      residual: list.length ? (wins - expectedWins) / list.length : null,
      shrunkResidual: (wins - expectedWins) / (list.length + REFEREE_CONFIG.priorMatches) };
  };
  return { team, ...summarize(rows), home: summarize(rows.filter(m => m.home === team)), away: summarize(rows.filter(m => m.away === team)),
    trend: rows.map((m, i) => { const summary = summarize(rows.slice(0, i + 1)); return { date: m.date, matches: i + 1, winRate: summary.winRate, expectedWinRate: summary.expectedWinRate }; }),
    recent: rows.slice(-8).reverse().map(({ id, date, home, away, homeGoals, awayGoals, source }) => ({ id, date, home, away, homeGoals, awayGoals, source })) };
}

export function refereeAnalysis(history, assignment, home, away, cutoff) {
  if (!assignment?.referee) return { status: 'not-listed', assignment: assignment || null, eligible: false, shift: 0 };
  const matches = history.filter(m => m.refereeId === assignment.referee.id && m.date < cutoff && !m.excluded);
  const homeTeam = teamSummary(matches, home), awayTeam = teamSummary(matches, away);
  const eligible = matches.length >= REFEREE_CONFIG.minimumRefereeMatches && Math.min(homeTeam.matches, awayTeam.matches) >= REFEREE_CONFIG.minimumTeamMatches;
  // Rakip/saha/form içeren temel beklentiden sapma, küçük örneklemde sıfıra yaklaştırılır.
  const shift = eligible ? Math.max(-REFEREE_CONFIG.maximumShift, Math.min(REFEREE_CONFIG.maximumShift,
    (homeTeam.shrunkResidual - awayTeam.shrunkResidual) / 2)) : 0;
  return { status: eligible ? 'candidate' : 'insufficient', assignment, refereeMatches: matches.length,
    homeTeam, awayTeam, eligible, shift, cutoff };
}

export function adjustedPrediction(base, analysis) {
  if (!analysis.eligible || !analysis.shift) return base;
  const shift = Math.max(0.001 - base.home, Math.min(base.away - 0.001, analysis.shift));
  const target = { H: base.home + shift, D: base.draw, A: base.away - shift };
  const original = { H: base.home, D: base.draw, A: base.away };
  const scores = base.scores.map(s => ({ ...s, p: s.p * target[s.outcome] / original[s.outcome] }));
  const best = scores.reduce((a, b) => a.p >= b.p ? a : b);
  const sum = predicate => scores.reduce((s, row) => s + (predicate(row) ? row.p : 0), 0);
  return { ...base, scores, home: target.H, draw: target.D, away: target.A,
    homeMean: scores.reduce((s, row) => s + row.h * row.p, 0), awayMean: scores.reduce((s, row) => s + row.a * row.p, 0),
    over25: sum(s => s.h + s.a > 2), btts: sum(s => s.h > 0 && s.a > 0), likelyScore: `${best.h}-${best.a}`, scoreProbability: best.p };
}

export function predictionLoss(p, match) {
  const outcome = match.homeGoals > match.awayGoals ? 0 : match.homeGoals === match.awayGoals ? 1 : 2;
  const values = [p.home, p.draw, p.away];
  return { brier: values.reduce((sum, v, i) => sum + (v - Number(i === outcome)) ** 2, 0), logLoss: -Math.log(Math.max(1e-12, values[outcome])) };
}

export function refereeValidation(rows, totalMatches, season = '2025-2026') {
  const eligible = rows.filter(r => r.eligible);
  const mean = (list, field, metric) => list.length ? list.reduce((s, r) => s + r[field][metric], 0) / list.length : null;
  const difference = metric => {
    if (eligible.length < 2) return null;
    const deltas = eligible.map(r => r.candidate[metric] - r.base[metric]);
    const value = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    // Aynı haftadaki maçlar bağımsız varsayılmaz; belirsizlik hafta kümeleriyle hesaplanır.
    const groups = Map.groupBy(eligible, r => `${r.season}:${r.round}`);
    if (groups.size < 2) return null;
    const variance = [...groups.values()].reduce((sum, group) => sum + group.reduce((s, r) => s + r.candidate[metric] - r.base[metric] - value, 0) ** 2, 0) * groups.size / (groups.size - 1) / eligible.length ** 2;
    return { mean: value, low: value - 1.96 * Math.sqrt(variance), high: value + 1.96 * Math.sqrt(variance), weeks: groups.size };
  };
  const brierDifference = difference('brier'), logLossDifference = difference('logLoss');
  const coverage = totalMatches ? rows.length / totalMatches : 0;
  const approved = eligible.length >= REFEREE_CONFIG.minimumValidationMatches && coverage >= 0.8
    && brierDifference?.weeks >= 15 && brierDifference.high < 0 && logLossDifference?.high < 0;
  return { season, matches: rows.length, totalMatches, eligibleMatches: eligible.length, coverage, approved: Boolean(approved),
    base: { brier: mean(rows, 'base', 'brier'), logLoss: mean(rows, 'base', 'logLoss') },
    candidate: { brier: mean(rows, 'candidate', 'brier'), logLoss: mean(rows, 'candidate', 'logLoss') },
    brierDifference, logLossDifference, config: REFEREE_CONFIG };
}
