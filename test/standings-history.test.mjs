import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { comparisonWeek, standingsHistoryRows } from '../public/standings-history.js';

// Sabit örnekler, canlı arşiv yeni sezonlara ilerlediğinde birim testlerini değiştirmez.
// TFF'den doğrulanan bu dar örnekler tam sezon cetveli değildir.
const archive = { seasons: [
  { season: '2025-2026', maxRound: 34, teams: ['Galatasaray'], weeks: {
    3: { rows: [{ rank: 1, team: 'Galatasaray', played: 3, points: 9 }] },
  } },
  { season: '2024-2025', maxRound: 38, teams: ['Galatasaray'], weeks: {
    3: { rows: [{ rank: 1, team: 'Galatasaray', played: 3, points: 9 }], source: 'https://www.tff.org/default.aspx?pageID=1730&hafta=3' },
    4: { rows: [{ rank: 1, team: 'Galatasaray', played: 4, points: 12 }], source: 'https://www.tff.org/default.aspx?pageID=1730&hafta=4' },
  } },
  { season: '2016-2017', maxRound: 34, teams: ['Başakşehir', 'Galatasaray'], weeks: {
    3: { rows: [{ rank: 1, team: 'Başakşehir', played: 3, points: 9 }, { rank: 3, team: 'Galatasaray', played: 3, points: 7 }] },
  } },
] };
const lookup = (week, type, value, source = archive) => standingsHistoryRows(source, '2026-2027', week, { type, value });

test('Geçmiş hafta, seçilen cetvele uyar; bay geçen takımın maç sayısına bağlı değildir', () => {
  const snapshot = { round: 4, status: 'upcoming', table: [{ played: 2 }] };
  assert.equal(comparisonWeek(snapshot, 'current'), 3);
  assert.equal(comparisonWeek(snapshot, 'predicted'), 4);
  for (const status of ['in-progress', 'complete']) assert.equal(comparisonWeek({ ...snapshot, status }, 'current'), 4);
  assert.equal(comparisonWeek({ round: 1, status: 'upcoming' }, 'current'), 0);
});

test('Sıra ve takım tıklamaları farklı tarihsel soruları yanıtlar, tam on sezon döner', () => {
  const rank = lookup(3, 'rank', '1');
  const team = lookup(3, 'team', 'Galatasaray');
  assert.equal(rank.length, 10);
  assert.equal(rank[0].season, '2025-2026');
  assert.equal(rank.at(-1).season, '2016-2017');
  assert.equal(rank.filter(r => r.row).length, 3);
  assert.ok(rank.filter(r => r.row).every(r => r.row.rank === 1));
  assert.ok(team.filter(r => r.row).every(r => r.row.team === 'Galatasaray'));
  // Aynı haftanın TFF cetveli: lider Başakşehir, Galatasaray üçüncü.
  assert.equal(rank.at(-1).row.team, 'Başakşehir');
  assert.equal(rank.at(-1).row.points, 9);
  assert.equal(team.at(-1).row.rank, 3);
  assert.equal(team.at(-1).row.points, 7);
});

test('Geçmiş cetvel sezon sonu puanını veya seçilen tahminin puanını kullanmaz', () => {
  const third = lookup(3, 'team', 'Galatasaray').find(r => r.season === '2024-2025');
  const fourth = lookup(4, 'team', 'Galatasaray').find(r => r.season === '2024-2025');
  assert.equal(third.row.points, 9);
  assert.equal(third.row.played, 3);
  assert.equal(fourth.row.points, 12);
  assert.equal(fourth.row.played, 4);
  assert.equal(new URL(third.source).searchParams.get('hafta'), '3');
});

test('Ligde olmayan takım, eksik cetvel ve olmayan hafta birbirine karıştırılmaz', () => {
  assert.equal(lookup(3, 'team', 'Amed SK').filter(r => r.status === 'absent').length, 3);
  assert.equal(lookup(3, 'team', 'Amed SK').filter(r => r.status === 'missing').length, 7);
  const missing = structuredClone(archive);
  delete missing.seasons[0].weeks[3];
  assert.equal(lookup(3, 'team', 'Galatasaray', missing)[0].status, 'missing');
  assert.equal(lookup(3, 'team', 'Amed SK', missing)[0].status, 'absent');
  assert.equal(lookup(99, 'rank', '1')[0].status, 'no-week');
  assert.equal(lookup(3, 'rank', '99')[0].status, 'no-rank');
  assert.ok(lookup(3, 'team', 'Galatasaray', null).every(r => r.status === 'missing'));
});

test('Yayımlanan arşiv görünen haftaları kapsar ve takım kimlikleri tutarlıdır', async () => {
  const dashboardPath = process.env.PTNEXT_DASHBOARD || 'public/data/dashboard.json';
  const dashboard = JSON.parse(await readFile(dashboardPath, 'utf8'));
  const history = dashboard.standingsHistory;
  assert.equal(history.currentSeason, dashboard.season);
  assert.equal(history.seasons.length, 10);
  const identities = new Map();
  for (const season of history.seasons) {
    for (const snapshot of dashboard.snapshots) for (const sort of ['current', 'predicted']) {
      const week = comparisonWeek(snapshot, sort);
      if (week && week <= season.maxRound) assert.ok(season.weeks[week], `${season.season} / ${week}. hafta eksik`);
    }
    for (const [week, table] of Object.entries(season.weeks)) {
      assert.equal(new URL(table.source).hostname, 'www.tff.org');
      assert.match(table.sha256, /^[a-f0-9]{64}$/);
      assert.ok(Number.isFinite(Date.parse(table.retrievedAt)));
      assert.equal(table.rows.length, season.teams.length);
      assert.equal(new Set(table.rows.map(r => r.teamId)).size, table.rows.length);
      for (const [i, row] of table.rows.entries()) {
        assert.equal(row.rank, i + 1);
        assert.ok(Number.isInteger(row.points) && row.points <= 3 * row.played && row.played <= Number(week));
        assert.ok(season.teams.includes(row.team));
        if (identities.has(row.teamId)) assert.equal(identities.get(row.teamId), row.team);
        identities.set(row.teamId, row.team);
      }
    }
  }
});
