import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseTff } from './tff.mjs';
import { canonicalTeam } from './data.mjs';
import { kickoff } from './cycle.mjs';

async function readWeeklyStandings(root, current, round) {
  const html = await readFile(resolve(root, `data/research/tff/current-week-${round}.html`), 'utf8');
  const actual = parseTff(html);
  const selected = html.match(/class="aspNetDisabled TRcolor"[^>]*>[\s\S]*?class="innerWrap">(\d+)\.Hafta/);
  if (actual.season !== current.season || Number(selected?.[1]) !== round || actual.standings.some(r => r.played > round)) throw new Error('TFF hafta cetveli istenen dönemle uyuşmuyor.');
  return actual.standings.map(r => ({ ...r, team: canonicalTeam(r.team) }));
}

export async function currentSeasonHistory(root, current, previous = null) {
  const weeks = {};
  // Gerçek sezon yolu, tahmin kaydının varlığına bağlı değildir.
  for (const [round, fixtures] of Map.groupBy(current.fixtures, m => m.round)) {
    if (fixtures.some(m => m.homeGoals === null)) continue;
    try {
      const rows = await readWeeklyStandings(root, current, round);
      weeks[round] = { source: `${current.source}&hafta=${round}`, rows: rows.map(({ team, rank, points, played }) => ({ team, rank, points, played })) };
    } catch (error) {
      const stored = previous?.season === current.season ? previous.weeks?.[round] : null;
      if (error.code !== 'ENOENT' || !stored) throw error;
      weeks[round] = stored;
    }
  }
  return { season: current.season, teams: current.standings.map(r => canonicalTeam(r.team)),
    maxRound: Math.max(...current.fixtures.map(m => m.round)), weeks };
}

export function compareReport(predicted, actual) {
  const rows = actual.map(row => {
    const forecast = predicted.find(p => p.team === row.team);
    if (!forecast) throw new Error('Haftalık karnede takım eşleşmedi.');
    return { team: row.team, rank: row.rank, points: row.points, played: row.played, predictedRank: forecast.rank, predictedPoints: forecast.points,
      rankError: Math.abs(forecast.rank - row.rank), pointsError: Math.abs(forecast.points - row.points) };
  });
  return { rows, exactRanks: rows.filter(r => !r.rankError).length, exactPoints: rows.filter(r => !r.pointsError).length,
    meanRankError: rows.reduce((s, r) => s + r.rankError, 0) / rows.length };
}

export async function weeklyReports(root, current, snapshots, previous = []) {
  const reports = [];
  for (let round = 1; round <= snapshots.at(-1).round; round++) {
    const fixtures = current.fixtures.filter(m => m.round === round);
    let opening;
    try { opening = JSON.parse(await readFile(resolve(root, `data/predictions/${current.season}-week-${round}-opening-v2.json`), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (opening && (!fixtures.every(m => Date.parse(opening.generatedAt) < kickoff(m)) || opening.generatedAt !== opening.snapshot?.generatedAt)) throw new Error('Hafta başı tahmininin maç öncesi zamanı doğrulanamadı.');
    const snapshot = opening?.snapshot || snapshots.find(s => s.round === round);
    if (!snapshot) { const old = previous.find(r => r.round === round && r.season === current.season); if (old) reports.push(old); continue; }
    const completed = fixtures.length > 0 && fixtures.every(m => m.homeGoals !== null);
    const report = { season: current.season, round, kind: opening ? 'recorded' : 'retrospective', completed,
      generatedAt: opening?.generatedAt || snapshot.generatedAt, modelVersion: opening?.modelVersion || null,
      matches: fixtures.length, rows: [], source: `${current.source}&hafta=${round}` };
    if (completed) {
      let actual;
      try { actual = await readWeeklyStandings(root, current, round); }
      catch (error) {
        const old = previous.find(r => r.round === round && r.season === current.season && r.completed);
        if (error.code !== 'ENOENT' || !old) throw error;
        reports.push(old);
        continue;
      }
      Object.assign(report, compareReport(snapshot.projection.table, actual));
      report.correctResults = fixtures.filter(m => {
        const pick = snapshot.projection.picks.find(p => p.id === m.id);
        return pick && Math.sign(pick.homeGoals - pick.awayGoals) === Math.sign(m.homeGoals - m.awayGoals);
      }).length;
    }
    reports.push(report);
  }
  return reports;
}

export function europeanCases(archive, matches) {
  const cohorts = Map.groupBy(archive.matches, m => `${m.season}:${m.team}`);
  const result = [];
  for (const [key, europe] of cohorts) {
    const { team, season } = europe[0];
    const league = matches.filter(m => !m.excluded && m.season === season && [m.home, m.away].includes(team));
    for (const match of league) {
      const past = europe.filter(m => Date.parse(match.date) > Date.parse(m.date) && Date.parse(match.date) - Date.parse(m.date) <= 4 * 86400000).sort((a, b) => b.date.localeCompare(a.date))[0];
      const next = europe.filter(m => Date.parse(m.date) > Date.parse(match.date) && Date.parse(m.date) - Date.parse(match.date) <= 4 * 86400000).sort((a, b) => a.date.localeCompare(b.date))[0];
      const home = match.home === team;
      const gf = home ? match.homeGoals : match.awayGoals, ga = home ? match.awayGoals : match.homeGoals;
      result.push({ cohort: key, team, season, date: match.date, home, opponent: home ? match.away : match.home,
        points: gf > ga ? 3 : gf === ga ? 1 : 0, score: `${gf}–${ga}`, after: past || null, before: next || null, source: match.source });
    }
  }
  return { ...archive, cases: result };
}
