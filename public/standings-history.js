// Karşılaştırma haftası, ekranda görünen cetvele aittir; maç sayısından türetilmez.
export function comparisonWeek(snapshot, sort) {
  return sort === 'predicted' || ['complete', 'in-progress'].includes(snapshot.status)
    ? snapshot.round : Math.max(0, snapshot.round - 1);
}

export function standingsHistoryRows(archive, currentSeason, week, selection) {
  const start = Number(currentSeason.slice(0, 4));
  return Array.from({ length: 10 }, (_, i) => {
    const year = start - i - 1;
    const season = `${year}-${year + 1}`;
    const entry = archive?.seasons.find(s => s.season === season);
    const table = entry?.weeks[week];
    const row = table?.rows.find(r => selection.type === 'rank' ? r.rank === Number(selection.value) : r.team === selection.value);
    const status = row ? 'found' : !entry ? 'missing'
      : selection.type === 'team' && entry.teams.length && !entry.teams.includes(selection.value) ? 'absent'
      : week > entry.maxRound ? 'no-week' : !table ? 'missing' : 'no-rank';
    return { season, row, status, source: table?.source };
  });
}
