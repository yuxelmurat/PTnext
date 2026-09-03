import { plain } from './tff.mjs';
import { fromMeans } from '../public/model.js';
import { kickoff } from './cycle.mjs';

export const SQUAD_VERSION = 'lineup-residual-0.1';
export const SQUAD_CONFIG = Object.freeze({ prior: 30, minimumTeamMatches: 12, minimumPlayerStarts: 5, maximumLogShift: 0.25, reviewHours: 120 });

export function parseLineup(html, match) {
  const sides = [1, 2].map(side => {
    const players = [];
    const regex = new RegExp(`<a\\b[^>]*id="[^"]*grdTakim${side}_rpt(Kadrolar|Yedekler)_[^"]*lnkOyuncu"[^>]*href="[^"]*kisiId=(\\d+)[^"]*"[^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
    for (const item of html.matchAll(regex)) players.push({ id: item[2], name: plain(item[3]), starter: item[1].toLowerCase() === 'kadrolar' });
    if (!players.length) return null;
    if (players.filter(p => p.starter).length !== 11 || new Set(players.map(p => p.id)).size !== players.length) throw new Error(`${match.id}: ilk 11 veya oyuncu kimlikleri tutarsız.`);
    return { team: side === 1 ? match.home : match.away, players };
  });
  if (sides.some(s => !s)) return null;
  for (const id of [match.homeId, match.awayId]) if (id && !html.includes(`kulupId=${id}`)) throw new Error(`${match.id}: kadro takım kimliği uyuşmuyor.`);
  return { matchId: match.id, date: match.date, season: match.season, home: sides[0], away: sides[1], source: match.source };
}

export function createSquadModel() { return { teams: {} }; }
function teamState(model, team) { return model.teams[team] || { count: 0, players: {}, last: null }; }
const limit = value => Math.max(-SQUAD_CONFIG.maximumLogShift, Math.min(SQUAD_CONFIG.maximumLogShift, value));

// Oyuncu sayısı güç değildir. Aynı takımın olağan ilk 11'inden farkı ölçülür.
export function lineupEffect(model, team, ids) {
  const state = teamState(model, team), selected = new Set(ids);
  if (ids.length !== 11 || selected.size !== 11) return { eligible: false, attack: 0, defence: 0, known: 0 };
  const known = ids.filter(id => (state.players[id]?.starts || 0) >= SQUAD_CONFIG.minimumPlayerStarts).length;
  if (state.count < SQUAD_CONFIG.minimumTeamMatches || known < 8) return { eligible: false, attack: 0, defence: 0, known };
  let attack = 0, defence = 0;
  for (const [id, player] of Object.entries(state.players)) {
    const centered = Number(selected.has(id)) - player.starts / state.count;
    // Takım/saha/rakip gol beklentisinden kalan hata, düzenlileştirilmiş oyuncu katsayısını besler.
    attack += centered * player.attack / (SQUAD_CONFIG.prior + player.variance);
    defence += centered * player.defence / (SQUAD_CONFIG.prior + player.variance);
  }
  return { eligible: true, attack: limit(attack), defence: limit(defence), known };
}

export function squadPrediction(base, homeEffect, awayEffect) {
  if (!homeEffect.eligible || !awayEffect.eligible) return base;
  return { ...base, ...fromMeans(Math.max(0.2, Math.min(4.5, base.homeMean * Math.exp(homeEffect.attack + awayEffect.defence))),
    Math.max(0.2, Math.min(4.5, base.awayMean * Math.exp(awayEffect.attack + homeEffect.defence)))) };
}

export function learnLineup(model, match, record, base) {
  if (!record || match.excluded) return;
  for (const side of ['home', 'away']) {
    const team = match[side], other = side === 'home' ? 'away' : 'home';
    const state = model.teams[team] ||= { count: 0, players: {}, last: null };
    const starters = new Set(record[side].players.filter(p => p.starter).map(p => p.id));
    for (const p of record[side].players) state.players[p.id] ||= { id: p.id, name: p.name, starts: 0, bench: 0, attack: 0, defence: 0, variance: 0 };
    for (const player of Object.values(state.players)) {
      const centered = Number(starters.has(player.id)) - (state.count ? player.starts / state.count : Number(starters.has(player.id)));
      const goalResidual = (match[`${side}Goals`] - base[`${side}Mean`]) / Math.max(1, base[`${side}Mean`]);
      const concededResidual = (match[`${other}Goals`] - base[`${other}Mean`]) / Math.max(1, base[`${other}Mean`]);
      player.attack += centered * goalResidual;
      player.defence += centered * concededResidual;
      player.variance += centered ** 2;
      player.starts += Number(starters.has(player.id));
      player.bench += Number(record[side].players.some(p => p.id === player.id && !p.starter));
    }
    state.count++;
    state.last = { ...record[side], date: match.date, season: match.season, source: record.source };
  }
}

export function validateSquadReview(review, fixtures, now = Date.now()) {
  if (!review || review.schemaVersion !== 1 || !Array.isArray(review.teams) || !Array.isArray(review.events)) throw new Error('Kadro inceleme şeması geçersiz.');
  if ((review.teams.length || review.events.length) && review.season !== fixtures[0]?.season) throw new Error('Kadro incelemesi güncel fikstür sezonuna ait değil.');
  const url = value => { try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch { return false; } };
  const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now;
  const reviewed = new Set();
  for (const team of review.teams) {
    if (!fixtures.some(m => m.home === team.team || m.away === team.team) || reviewed.has(team.team) || !timestamp(team.checkedAt) || !Array.isArray(team.matchIds) || !team.matchIds.length || team.matchIds.some(id => !fixtures.some(m => m.id === id && [m.home, m.away].includes(team.team))) || !Array.isArray(team.sources) || !team.sources.length || team.sources.some(s => !url(s)) || !['reviewed', 'incomplete'].includes(team.status)) throw new Error('Takım incelemesi veya kaynağı geçersiz.');
    reviewed.add(team.team);
  }
  const keys = new Set();
  for (const event of review.events) {
    const match = fixtures.find(m => m.id === event.matchId);
    const key = `${event.matchId}:${event.team}:${event.playerId}`;
    if (!match || ![match.home, match.away].includes(event.team) || !/^\d+$/.test(event.playerId || '') || !event.playerName || keys.has(key)
      || !['out', 'doubtful', 'available'].includes(event.status) || !['injury', 'suspension', 'international', 'registration', 'rotation', 'return'].includes(event.reason)
      || !timestamp(event.publishedAt) || !timestamp(event.checkedAt) || Date.parse(event.publishedAt) > Date.parse(event.checkedAt)
      || !url(event.source) || typeof event.evidence !== 'string' || event.evidence.trim().length < 15 || !Number.isFinite(Date.parse(event.validUntil))
      || Date.parse(event.validUntil) < Date.parse(event.checkedAt)) throw new Error(`Oyuncu durum kaydı geçersiz: ${key}`);
    if (event.replacementId && (!/^\d+$/.test(event.replacementId) || event.replacementId === event.playerId || !['GK', 'DEF', 'MID', 'FWD'].includes(event.position) || event.replacementPosition !== event.position || !url(event.replacementSource) || typeof event.replacementEvidence !== 'string' || event.replacementEvidence.trim().length < 15)) throw new Error(`${key}: aynı pozisyonda yedek doğrulaması eksik.`);
    keys.add(key);
  }
  return review;
}

export function expectedSquad(model, team, fixture, review, now = Date.now()) {
  const state = teamState(model, team), last = state.last;
  const checked = review?.teams.find(t => t.team === team);
  const fresh = checked?.status === 'reviewed' && checked.matchIds.includes(fixture.id) && now >= Date.parse(checked.checkedAt) && now - Date.parse(checked.checkedAt) <= SQUAD_CONFIG.reviewHours * 3600000;
  const targetEvents = (review?.events || []).filter(e => e.team === team && e.matchId === fixture.id);
  const events = targetEvents.filter(e => Date.parse(e.checkedAt) <= now && now - Date.parse(e.checkedAt) <= SQUAD_CONFIG.reviewHours * 3600000 && Date.parse(e.validUntil) >= Math.max(now, kickoff(fixture)));
  const staleEvents = targetEvents.length - events.length;
  const unavailable = new Set(events.filter(e => e.status === 'out').map(e => e.playerId));
  const doubtful = events.filter(e => e.status === 'doubtful');
  // Son maç kadrosunda görülmeyen yeni transferi veya yedek oyuncuyu kendiliğinden uydurmaz.
  const pool = last?.season === fixture.season ? last.players : [];
  const missing = events.filter(e => !pool.some(p => p.id === e.playerId));
  const selected = pool.filter(p => p.starter && !unavailable.has(p.id));
  const replacements = [];
  for (const out of pool.filter(p => p.starter && unavailable.has(p.id))) {
    const event = events.find(e => e.playerId === out.id);
    const replacement = pool.find(p => p.id === event.replacementId && !unavailable.has(p.id) && !selected.some(s => s.id === p.id));
    if (replacement) { selected.push(replacement); replacements.push({ out: out.name, in: replacement.name }); }
  }
  const effect = lineupEffect(model, team, selected.map(p => p.id));
  // Pozisyonu eşlenmemiş yedek, şüpheli durum veya incelenmemiş takım için otomatik düzeltme yok.
  effect.eligible &&= Boolean(fresh && !staleEvents && !doubtful.length && !missing.length && pool.length && selected.length === 11);
  return { team, status: !pool.length ? 'no-current-lineup' : !fresh ? 'review-needed' : doubtful.length || staleEvents ? 'uncertain' : !effect.eligible ? 'insufficient' : 'ready',
    checkedAt: checked?.checkedAt || null, reviewNote: checked?.note || null, reviewSources: checked?.sources || [], source: last?.source || null, lastMatchDate: last?.date || null,
    observedPlayers: pool.length, players: pool.map(p => ({ id: p.id, name: p.name, starter: p.starter, starts: state.players[p.id]?.starts || 0 })),
    expectedXI: selected.map(p => ({ id: p.id, name: p.name })), events, staleEvents, replacements, effect };
}
