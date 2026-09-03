import { simulate, projectTable, selectScore } from './model.js';
import { comparisonWeek, standingsHistoryRows } from './standings-history.js';
import { initInsights } from './insights.js';
import { readSharedState } from './insights-model.js';
import { squadMarkup } from './squad-view.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = (value, digits = 0) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const percent = (value, digits = 0) => `%${number(value * 100, digits)}`;
// Görünen 1/X/2 yüzdeleri toplamda 100 eder; hesaplama ham olasılıkları kullanır.
function displayPrediction(prediction) {
  const keys = ['home', 'draw', 'away'];
  const values = keys.map(key => prediction[key] * 100);
  const integers = values.map(Math.floor);
  const remainderOrder = values.map((v, i) => ({ i, fraction: v - integers[i] })).sort((a, b) => b.fraction - a.fraction);
  for (let n = 0; n < 100 - integers.reduce((a, b) => a + b, 0); n++) values[remainderOrder[n].i] = integers[remainderOrder[n].i] + 1;
  return { ...prediction, ...Object.fromEntries(keys.map((key, i) => [key, Math.floor(values[i]) / 100])) };
}
const dateLabel = (date, options = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('tr-TR', { ...options, timeZone: 'Europe/Istanbul' }).format(new Date(date.length === 10 ? `${date}T12:00:00+03:00` : date));
let data, snapshot, forecast, projection, conditions = {}, sort = 'current', simulationRequest = 0;
let historySelection = null, insights = null;
const info = name => data.teams.find(t => t.name === name) || { short: name.slice(0, 3), color: '#59708b' };
const crest = name => { const t = info(name); return `<span class="crest" style="--club:${escape(t.color)}" aria-hidden="true">${escape(t.short)}</span>`; };
function pickLabel(match) {
  const pick = selectScore(match.prediction, conditions[match.id]);
  const result = pick.outcome === 'D' ? 'Beraberlik' : `${pick.outcome === 'H' ? match.home : match.away} kazanır`;
  return `${conditions[match.id] ? 'Senaryon' : 'PTnext tahmini'}: ${escape(result)} · ${pick.homeGoals}–${pick.awayGoals}`;
}
function refereeMarkup(match) {
  const r = match.referee;
  const coverage = data.refereeCoverage;
  const heading = '<div class="eyebrow">HAKEM VE TAKIM GEÇMİŞİ</div><h3>Beklentiden farklı bir performans var mı?</h3>';
  if (!r?.assignment?.referee) return `<section class="referee-analysis">${heading}<p>${r?.status === 'archived-without-referee' || snapshot.archived ? 'Bu tahmin arşivinde hakem analizi kaydedilmemiş.' : 'Kontrol edilen TFF maç sayfasında orta hakem adı listelenmiyor.'} Hakem düzeltmesi uygulanmadı.</p><p class="small-note">İsim veya etki oranı varsayılmadı. ${coverage ? `${number(coverage.trainingMatches)} tarihsel hakemli maç analiz için hazır.` : ''}</p><a class="dialog-source" href="${escape(match.source)}" target="_blank" rel="noopener noreferrer">TFF hakem kaydını kontrol et ↗</a></section>`;
  const rate = value => value === null ? '—' : percent(value, 1);
  const stats = [r.homeTeam, r.awayTeam].map(team => {
    const points = key => team.trend.map((p, i) => `${team.trend.length > 1 ? i * 250 / (team.trend.length - 1) + 5 : 130},${65 - p[key] * 60}`).join(' ');
    return `<div class="referee-team"><h4>${escape(team.team)}</h4><div class="referee-win"><strong>${rate(team.winRate)}</strong><span>${team.matches} maç · ${team.wins}G ${team.draws}B ${team.losses}M</span></div><dl><div><dt>Temel modelin beklediği galibiyet</dt><dd>${rate(team.expectedWinRate)}</dd></div><div><dt>Ham oranın %95 belirsizlik aralığı</dt><dd>${team.interval ? `${rate(team.interval.low)}–${rate(team.interval.high)}` : 'Veri yok'}</dd></div><div><dt>Ev sahibi olarak</dt><dd>${rate(team.home.winRate)} · ${team.home.matches} maç</dd></div><div><dt>Deplasmanda</dt><dd>${rate(team.away.winRate)} · ${team.away.matches} maç</dd></div></dl>${team.trend.length ? `<svg class="referee-trend" viewBox="0 0 260 72" role="img" aria-label="${escape(team.team)}: bu hakemle kümülatif galibiyet oranı ve beklenen oran"><path d="M5 5H255M5 35H255M5 65H255" stroke="#e4e9ee" fill="none"/><polyline points="${points('expectedWinRate')}" fill="none" stroke="#a1b2c6" stroke-width="2" stroke-dasharray="4 3"/><polyline points="${points('winRate')}" fill="none" stroke="#2166e8" stroke-width="2"/></svg><p class="small-note">${dateLabel(team.trend[0].date, { year: 'numeric', month: 'short', day: 'numeric' })} → ${dateLabel(team.trend.at(-1).date, { year: 'numeric', month: 'short', day: 'numeric' })} · Mavi: gerçekleşen, kesikli: beklenen.</p>` : ''}<details><summary>Bu hakemle son ${team.recent.length} maç</summary>${historyTable(team.recent)}</details></div>`;
  }).join('');
  const why = r.applied ? 'Geçmiş dönem doğrulamasını geçen düzeltme bu tahminde kullanıldı.' : !r.eligible ? `Örneklem yetersiz: hakem için en az 30, her takım için en az 8 önceki maç gerekiyor.` : snapshot.retrospective ? 'Geçmiş canlandırmada daha sonraki doğrulama kararı kullanılmaz.' : 'Aday düzeltme geçmiş dönem doğrulamasını geçmedi; ana tahmine uygulanmadı.';
  return `<section class="referee-analysis">${heading}<div class="referee-name">${escape(r.assignment.referee.name.toLocaleLowerCase('tr-TR'))}<span>Orta hakem · ${r.refereeMatches} önceki lig maçı</span></div><p class="small-note">Oranlar yalnız bu hakemle oynanan, tahmin tarihinden önceki maçlara aittir. Takımın rakip ve saha gücüne göre beklenen performansıyla karşılaştırılır.</p><div class="referee-teams">${stats}</div><div class="referee-adjustment"><strong>${escape(match.home)} kazanır: ${percent(r.baseHome, 1)} → ${percent(r.finalHome, 1)}</strong><span>Uygulanan değişim: ${r.appliedShift > 0 ? '+' : ''}${number(r.appliedShift * 100, 1)} yüzde puan</span><p>${why}</p>${r.eligible && !r.applied ? `<p>Araştırma adayı: ${percent(r.candidateHome, 1)}. Bu oran tablonun hesabında kullanılmıyor.</p>` : ''}</div><p class="small-note">Bu analiz ilişki ölçer. Galibiyet oranı farkı; hakemin kayırdığını, kararlarının yanlış olduğunu veya doğrudan etki oranını kanıtlamaz. Penaltı/VAR karar doğruluğu ve pozisyon bazlı karşılaştırmalar bu veride yok.</p><a class="dialog-source" href="${escape(r.assignment.source)}" target="_blank" rel="noopener noreferrer">TFF atama kaydı ↗</a><p class="small-note">Kaynak kontrolü: ${dateLabel(r.assignment.retrievedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p></section>`;
}

function standingsHistoryMarkup() {
  const week = comparisonWeek(snapshot, sort);
  const title = historySelection.type === 'rank' ? `${week}. haftada ${historySelection.value}. sırada kim vardı?` : `${historySelection.value} · ${week}. hafta geçmişi`;
  const rows = standingsHistoryRows(data.standingsHistory, data.season, week, historySelection);
  const labels = { absent: 'Bu sezon Süper Lig’de yok', missing: 'Hafta verisi doğrulanamadı', 'no-week': 'Bu sezonda bu hafta yok', 'no-rank': 'Bu sezonda bu sıra yok' };
  return `<tr class="standings-history-row"><td colspan="8"><section id="standings-history" aria-labelledby="standings-history-title">
    <div class="standings-history-heading"><div><div class="eyebrow">HAFTANIN GEÇMİŞİ · SON 10 SEZON</div><h3 id="standings-history-title">${week ? escape(title) : 'Sezon başlangıcı'}</h3></div><button class="history-close" data-history-close aria-label="Geçmiş karşılaştırmasını kapat">×</button></div>
    ${week ? `<p class="standings-history-context">${sort === 'predicted' ? 'Tahmini tablonun' : 'Mevcut tablonun'} haftasıyla karşılaştırılıyor.${snapshot.status === 'in-progress' && sort === 'current' ? ' Güncel hafta sürüyor; geçmiş sezonlar hafta sonu cetvelidir.' : ''}</p>
    <div class="standings-history-grid" role="table" aria-label="${escape(title)}"><div class="standings-history-columns" role="row"><span role="columnheader">SEZON</span><span role="columnheader">TAKIM</span><span role="columnheader">SIRA</span><span role="columnheader" title="Oynanan maç">O</span><span role="columnheader">PUAN</span></div>${rows.map(({ season, row, status, source }) => `<div class="standings-history-entry ${row ? '' : 'history-unavailable'}" role="row"><span role="cell">${source ? `<a href="${escape(source)}" target="_blank" rel="noopener noreferrer" aria-label="${season} sezonu ${week}. hafta TFF cetveli (yeni sekme)">↗</a><button class="history-season-button" data-journey-season="${season}" data-journey-team="${escape(row?.team || historySelection.value)}" aria-label="${season} sezonunda ${escape(row?.team || historySelection.value)} grafiğini aç">${season.replace('-', '–')}</button>` : season.replace('-', '–')}</span>${row ? `<span class="history-club" role="cell">${crest(row.team)}<span>${escape(row.team)}</span></span><span role="cell"><b class="history-position ${row.rank === 1 ? 'history-leader' : ''}">${row.rank}</b></span><span role="cell">${row.played}</span><strong role="cell">${row.points}</strong>` : `<span class="history-unavailable-label" role="cell">${labels[status]}</span><span role="cell">—</span><span role="cell">—</span><span role="cell">—</span>`}</div>`).join('')}</div>
    <p class="standings-history-note">Kaynak: TFF hafta arşivi. Ertelenen maçların sonradan işlenen sonuçlarını içerebilir. Bu karşılaştırma tarihsel bağlam sunar; tek başına tahmin gerekçesi değildir.</p>` : '<p class="standings-history-context">Henüz tamamlanmış bir hafta yok. Geçmiş hafta cetvelini görmek için tahmini sırayı veya sonraki haftayı seç.</p>'}
  </section></td></tr>`;
}

function renderTable() {
  const predictedView = sort === 'predicted';
  const rows = predictedView ? projection.table : snapshot.table;
  $('.standings-table th:nth-child(3)').title = predictedView ? 'Tahmin edilen hafta tamamlandığında oynanmış maç sayısı' : 'Oynanan maç';
  $('.standings-table th:nth-child(4)').textContent = 'PUAN';
  $('.standings-table th:nth-child(4)').title = predictedView ? 'Seçilen maç tahminlerinden hesaplanan tam puan' : 'Mevcut gerçek puan';
  $('.standings-table th:nth-child(5)').title = predictedView ? 'Tahmini skorlar dahil son üç maç' : 'Gerçekleşen son üç maç';
  $('#table-subtitle').textContent = snapshot.status === 'complete' ? 'Sezon tamamlandı · Gerçek sonuçlar' : predictedView ? `${snapshot.round}. hafta sonu · Seçilen skorlarla 3 / 1 / 0 puan` : snapshot.status === 'in-progress' ? `${snapshot.round}. hafta sürüyor · Tamamlanan maçlar gerçek, kalanlar tahmin` : `${snapshot.round === 1 ? 'Sezon başlangıcı' : `${snapshot.round - 1}. hafta sonrası`} → ${snapshot.round}. hafta tahmini`;
  $('#standings-body').innerHTML = rows.map(row => {
    const predicted = projection.table.find(f => f.team === row.team);
    const uncertainty = forecast.find(f => f.team === row.team);
    const original = snapshot.table.find(t => t.team === row.team);
    const displayedRank = row.rank;
    const displayedPlayed = row.played;
    const displayedPoints = row.points;
    const delta = original.rank - predicted.rank;
    const movement = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
    const description = delta > 0 ? `${delta} sıra yükseliş` : delta < 0 ? `${-delta} sıra düşüş` : 'Sırası değişmiyor';
    const rankOpen = historySelection?.type === 'rank' && Number(historySelection.value) === displayedRank;
    const teamOpen = historySelection?.type === 'team' && historySelection.value === row.team;
    return `<tr class="${rankOpen || teamOpen ? 'history-origin' : ''}"><td><button id="history-rank-${displayedRank}" class="rank-number history-toggle ${displayedRank <= 3 ? 'rank-top' : ''}" data-history="rank" data-history-value="${displayedRank}" aria-expanded="${rankOpen}" ${rankOpen ? 'aria-controls="standings-history"' : ''} aria-label="${displayedRank}. sıranın geçmişini ${rankOpen ? 'kapat' : 'aç'}">${String(displayedRank).padStart(2, '0')}</button></td><td><button id="history-team-${displayedRank}" class="team-cell history-toggle" data-history="team" data-history-value="${escape(row.team)}" aria-expanded="${teamOpen}" ${teamOpen ? 'aria-controls="standings-history"' : ''} aria-label="${escape(row.team)} takımının geçmişini ${teamOpen ? 'kapat' : 'aç'}">${crest(row.team)}${escape(row.team)}<span class="history-chevron" aria-hidden="true">${teamOpen ? '⌃' : '⌄'}</span></button></td><td>${displayedPlayed}</td><td>${displayedPoints}</td><td class="form-col"><span class="form" aria-label="${predictedView ? 'Tahminler dahil son üç maç' : 'Son üç maç'}: ${row.form.slice(-3).map(f => ({ G: 'Galibiyet', B: 'Beraberlik', M: 'Mağlubiyet' })[f]).join(', ') || 'Henüz maç yok'}">${row.form.slice(-3).map(f => `<i class="${f}" aria-hidden="true">${f}</i>`).join('')}</span></td><td class="forecast-start"><span class="rank-change">${String(predicted.rank).padStart(2, '0')}<span class="delta ${movement}" aria-label="${description}">${delta > 0 ? '↑' : delta < 0 ? '↓' : '–'}${delta ? Math.abs(delta) : ''}</span></span></td><td>${predicted.points}</td><td>${uncertainty.rankLow}–${uncertainty.rankHigh}</td></tr>${rankOpen || teamOpen ? standingsHistoryMarkup() : ''}`;
  }).join('');
  const selected = Object.keys(conditions).length;
  $('#scenario-status').textContent = selected ? `${selected} maçta senin seçimin · Diğer maçlarda PTnext tahmini` : 'Puanlar seçilen skorlarla · Belirsizlik 10.000 senaryoyla';
  $('#reset-scenarios').disabled = !selected;
  $('#sort-current').setAttribute('aria-pressed', String(sort === 'current'));
  $('#sort-predicted').setAttribute('aria-pressed', String(sort === 'predicted'));
  $('#movers').innerHTML = [...forecast].sort((a, b) => b.up - a.up).slice(0, 4).map(f => `<div class="mover">${crest(f.team)}<div class="mover-data"><div class="mover-label"><span>${escape(f.team)}</span><b>${percent(f.up)}</b></div><div class="mover-line"><i style="width:${f.up * 100}%"></i></div></div></div>`).join('');
  for (const label of document.querySelectorAll('[data-pick]')) {
    const match = snapshot.fixtures.find(m => m.id === label.dataset.pick);
    if (match) label.innerHTML = pickLabel(match);
  }
  insights?.render();
}
function renderMatches() {
  $('#fixture-count').textContent = `${snapshot.fixtures.length} MAÇ · ${snapshot.round}. HAFTA`;
  $('#match-grid').innerHTML = snapshot.fixtures.map(m => {
    const p = displayPrediction(m.prediction);
    return `<article class="match-card ${conditions[m.id] ? 'has-condition' : ''}"><div class="match-card-top"><span>${dateLabel(m.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${m.time || 'Saat bekleniyor'}</span><button class="detail-button" data-detail="${m.id}" aria-label="${escape(m.home)} - ${escape(m.away)} maç detayları">Analiz ↗</button></div><div class="match-team-line">${crest(m.home)}${escape(m.home)}</div><div class="match-team-line">${crest(m.away)}${escape(m.away)}</div><div class="match-odds" role="group" aria-label="${escape(m.home)} - ${escape(m.away)} maç senaryosu">${[['H', '1', p.home, `${m.home} kazanır`], ['D', 'X', p.draw, 'Beraberlik'], ['A', '2', p.away, `${m.away} kazanır`]].map(([key, label, probability, title]) => `<button class="outcome" data-match="${m.id}" data-outcome="${key}" aria-pressed="${conditions[m.id] === key}" aria-label="${escape(title)}; model olasılığı ${percent(probability)}"><span>${label}</span><b>${percent(probability)}</b></button>`).join('')}</div><div class="match-mini"><span>2,5 üst <b>${percent(p.over25)}</b></span><span>Karşılıklı gol <b>${percent(p.btts)}</b></span>${m.result ? `<span>Sonuç <b>${m.result}</b></span>` : '<span>Model olasılığı</span>'}</div></article>`;
  }).join('');
  for (const match of snapshot.fixtures) {
    const card = document.querySelector(`[data-detail="${match.id}"].detail-button`).closest('.match-card');
    card.querySelector('.match-odds').insertAdjacentHTML('beforebegin', `<p class="match-pick" data-pick="${match.id}">${pickLabel(match)}</p>`);
    const r = match.referee;
    card.insertAdjacentHTML('beforeend', `<button class="referee-link" data-detail="${match.id}">${r?.assignment?.referee ? `Hakem: ${escape(r.assignment.referee.name.toLocaleLowerCase('tr-TR'))}` : 'Hakem kaydı bekleniyor'} <span>Analiz ↗</span></button>`);
  }
  $('#match-grid').insertAdjacentHTML('beforeend', (snapshot.completedMatches || []).map(m => `<article class="match-card"><div class="match-card-top">${dateLabel(m.date)} · Tamamlandı</div><div class="match-team-line">${crest(m.home)}${escape(m.home)}</div><div class="match-team-line">${crest(m.away)}${escape(m.away)}</div><p class="match-pick">Gerçek sonuç: ${m.homeGoals}–${m.awayGoals}</p><p class="small-note">Puanları mevcut tabloya işlendi. Tekrar tahmin edilmez.</p></article>`).join(''));
}
function renderSpotlight() {
  const derby = snapshot.fixtures.find(m => ['Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor'].includes(m.home) && ['Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor'].includes(m.away));
  const match = derby || snapshot.fixtures[0];
  if (!match) { $('#spotlight').innerHTML = '<h3 id="spotlight-title">Sezon tamamlandı.</h3><p class="spotlight-caption">Tablo bütün maçların gerçek sonuçlarını gösteriyor.</p>'; return; }
  const p = displayPrediction(match.prediction);
  const balanced = Math.abs(p.home - p.away) < 0.07;
  const favorite = p.home > p.away ? match.home : match.away;
  $('#spotlight').innerHTML = `<div class="eyebrow">${derby ? 'HAFTANIN DERBİSİ' : 'YAKIN PLAN'}</div><h3 id="spotlight-title">${derby ? 'Dengeleri değiştiren maç.' : 'Bir maçtan fazlası.'}</h3><span class="spotlight-date">${dateLabel(match.date, { day: 'numeric', month: 'long', weekday: 'long' })} · ${match.time || 'Saat bekleniyor'}</span><div class="spotlight-teams"><div class="spotlight-team">${crest(match.home)}<span>${escape(match.home)}</span></div><span class="spotlight-vs">VS</span><div class="spotlight-team">${crest(match.away)}<span>${escape(match.away)}</span></div></div><div class="prob-bar" aria-hidden="true"><span style="width:${p.home * 100}%"></span><span style="width:${p.draw * 100}%"></span><span style="width:${p.away * 100}%"></span></div><div class="prob-labels"><span>Ev sahibi<b>${percent(p.home)}</b></span><span>Beraberlik<b>${percent(p.draw)}</b></span><span>Deplasman<b>${percent(p.away)}</b></span></div><p class="spotlight-caption">${balanced ? 'Model iki takımın galibiyet olasılıklarını birbirine yakın görüyor.' : `${escape(favorite)} modelde daha yüksek galibiyet olasılığına sahip.`} Olasılıklar geçmiş skorlar ve saha avantajından hesaplandı.</p><button data-detail="${match.id}">Maçın verilerini incele <span>↗</span></button>`;
}
function setWeek(round) {
  simulationRequest++;
  historySelection = null;
  snapshot = data.snapshots.find(s => s.round === round);
  // Eski hafta başı kayıtlarının olasılıkları korunur; yeni koşullu özet bu olasılıklardan türetilir.
  if (snapshot.fixtures.length && !snapshot.forecast[0]?.conditional) snapshot.forecast = simulate(snapshot.table, snapshot.fixtures,
    { runs: 10000, seed: 2026 + round, playedMatches: snapshot.playedMatches, collectConditions: true });
  conditions = {};
  forecast = snapshot.forecast;
  projection = projectTable(snapshot.table, snapshot.fixtures, { playedMatches: snapshot.playedMatches });
  $('#week-select').value = String(round);
  $('#week-title').textContent = snapshot.status === 'complete' ? 'Sezon sonu tablosu' : snapshot.status === 'in-progress' ? `${round}. hafta · Kalan maçların tahmini` : `${round - 1}. haftadan ${round}. haftaya`;
  const dates = snapshot.fixtures.map(m => m.date).sort();
  $('#week-dates').textContent = dates.length ? `${dateLabel(dates[0])} – ${dateLabel(dates.at(-1))}` : 'Tamamlandı';
  $('#retrospective').hidden = !snapshot.retrospective && !snapshot.archived;
  $('#retrospective').textContent = snapshot.archived ? `Arşiv: ${dateLabel(snapshot.generatedAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} tarihinde yayımlanan hafta başı tahmini korunuyor. Maç sonuçları sonradan eklendi.` : 'Geçmiş hafta canlandırması: Tahminler yalnızca hafta başlamadan bilinen sonuçlarla bugün hesaplandı; önceden yayımlanmış tahmin değildir.';
  $('#prev-week').disabled = round === data.snapshots[0].round;
  $('#next-week').disabled = round === data.snapshots.at(-1).round;
  renderMatches(); renderSpotlight(); renderTable();
}
function runScenario() {
  const request = ++simulationRequest;
  // Önce seçimin ekrana yansımasına izin verilir; ardından aynı ortak model hesaplar.
  for (const button of document.querySelectorAll('[data-match]')) button.setAttribute('aria-pressed', String(conditions[button.dataset.match] === button.dataset.outcome));
  for (const card of document.querySelectorAll('.match-card')) card.classList.toggle('has-condition', Boolean(conditions[card.querySelector('[data-match]')?.dataset.match]));
  $('#scenario-status').textContent = 'Seçtiğin senaryo hesaplanıyor…';
  setTimeout(() => {
    if (request !== simulationRequest) return;
    forecast = Object.keys(conditions).length ? simulate(snapshot.table, snapshot.fixtures, { runs: 10000, seed: 2026 + snapshot.round, conditions, playedMatches: snapshot.playedMatches, collectConditions: true }) : snapshot.forecast;
    projection = projectTable(snapshot.table, snapshot.fixtures, { conditions, playedMatches: snapshot.playedMatches });
    renderTable();
  }, 30);
}
function historyTable(matches) {
  return matches.length ? `<table class="history-table"><thead class="sr-only"><tr><th>Tarih</th><th>Karşılaşma</th><th>Skor</th></tr></thead><tbody>${matches.map(m => `<tr><td>${dateLabel(m.date, { day: '2-digit', month: '2-digit', year: '2-digit' })}</td><td>${escape(m.home)} — ${escape(m.away)}</td><td>${m.homeGoals}–${m.awayGoals}</td></tr>`).join('')}</tbody></table>` : '<p class="history-empty">Bu tarihten önce arşivde karşılaşma bulunmuyor.</p>';
}
function showDetail(id) {
  const m = snapshot.fixtures.find(m => m.id === id);
  if (!m) return;
  const p = displayPrediction(m.prediction);
  $('#dialog-content').innerHTML = `<div class="eyebrow">${snapshot.round}. HAFTA · MAÇ ANALİZİ</div><h2 id="dialog-title" class="dialog-title">${escape(m.home)} — ${escape(m.away)}</h2><p class="small-note">${dateLabel(m.date, { day: 'numeric', month: 'long', weekday: 'long' })} · ${m.time || 'Saat bekleniyor'}${snapshot.retrospective ? ' · Geçmiş hafta canlandırması' : ''}</p><div class="dialog-probs"><div><strong>${percent(p.home)}</strong>Ev sahibi kazanır</div><div><strong>${percent(p.draw)}</strong>Beraberlik</div><div><strong>${percent(p.away)}</strong>Deplasman kazanır</div></div><p class="small-note">Model gol ortalamaları: <b>${number(p.homeMean, 2)} — ${number(p.awayMean, 2)}</b>. En olası tek skor: <b>${p.likelyScore}</b> (${percent(p.scoreProbability, 1)}). Bunlar şut bazlı xG değildir.</p><p class="small-note">Eğitimdeki takım maçları: ${escape(m.home)} ${p.evidence.homeMatches}, ${escape(m.away)} ${p.evidence.awayMatches}. ${Math.min(p.evidence.homeMatches, p.evidence.awayMatches) < 20 ? '<b>Takımlardan en az biri için veri az; lig ortalamasından başlayan tahmin daha belirsiz.</b>' : ''} Kadro katmanının veri durumu ve uygulanan etki aşağıda gösterilir.</p><h3 class="history-title">İkili rekabet · Son 5 lig maçı</h3>${historyTable(m.h2h)}<h3 class="history-title">${escape(m.home)} · Önceki 5 lig maçı</h3>${historyTable(m.recentHome)}<h3 class="history-title">${escape(m.away)} · Önceki 5 lig maçı</h3>${historyTable(m.recentAway)}<a class="dialog-source" href="${escape(m.source)}" target="_blank" rel="noopener noreferrer">TFF maç kaydını aç ↗</a>`;
  $('#dialog-title').insertAdjacentHTML('afterend', `<p class="match-pick">${pickLabel(m)}</p><p class="small-note">Tablo, en olası 1/X/2 sonucuna ve o sonuç içindeki en olası skora göre hesaplanır. Seçilen sonucun skor tahmini, bütün skorlar içindeki tek en olası skordan farklı olabilir.</p><p class="small-note">Ayrı istatistik — simülasyon ortalama puanı: ${escape(m.home)} ${number(forecast.find(t => t.team === m.home).expectedPoints, 1)}; ${escape(m.away)} ${number(forecast.find(t => t.team === m.away).expectedPoints, 1)}. Bu değerler puan tablosuna yazılmaz.</p>`);
  $('#dialog-content').insertAdjacentHTML('beforeend', refereeMarkup(m));
  $('#dialog-content').insertAdjacentHTML('beforeend', `<section class="referee-analysis"><div class="eyebrow">KADRO VE EKSİKLER</div><h3>Sahaya çıkabilecek kadro</h3>${squadMarkup(m, data.squadValidation, { escape, number, percent })}</section>`);
  $('#match-dialog').showModal();
}
function renderValidation() {
  const v = data.validation;
  $('#validation-description').textContent = `${number(v.count)} maç. İki sezon. Temel modelin tahminleri o günün sonuçları görülmeden hesaplandı.`;
  $('#validation-cards').innerHTML = [
    ['Maç sonucu isabeti', percent(v.model.accuracy, 1), percent(v.baseline.accuracy, 1), 'En yüksek olasılıklı 1 / X / 2 sonucunun isabeti. Sıralama isabeti değildir.'],
    ['Brier skoru', number(v.model.brier, 3), number(v.baseline.brier, 3), 'Üç sonucun olasılık hatası. Düşük değer daha iyi; bu tanımda aralık 0–2.'],
    ['Log loss', number(v.model.logLoss, 3), number(v.baseline.logLoss, 3), 'Yanlış sonuca yüksek güveni cezalandırır. Düşük değer daha iyi.'],
  ].map(([label, value, baseline, description]) => `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}<span>${baseline} baz</span></div><div class="metric-description">${description}</div></div>`).join('');
  $('#validation-seasons').innerHTML = v.bySeason.map(s => `<tr><td>${s.season.replace('-', ' / ')}</td><td>${s.count}</td><td><b>${percent(s.model.accuracy, 1)}</b></td><td>${percent(s.baseline.accuracy, 1)}</td></tr>`).join('');
  $('#validation-method').textContent = v.method;
  if (data.refereeValidation) {
    const check = data.refereeValidation;
    $('#referee-validation').innerHTML = `<div class="eyebrow">HAKEM VERİSİNİN EK KATKISI</div><h3>${check.approved ? 'Doğrulama eşiğini geçti' : 'Ana tahmine eklemek için kanıt yetersiz'}</h3><p>${number(check.matches)} hakemli test maçı · ${number(check.eligibleMatches)} maçta yeterli takım/hakem geçmişi · ${percent(check.coverage)} kapsama.</p><div class="referee-metrics"><span>Temel Brier <b>${check.base.brier === null ? '—' : number(check.base.brier, 4)}</b></span><span>Hakem adayı (${check.eligibleMatches} uygulama) <b>${check.candidate.brier === null ? '—' : number(check.candidate.brier, 4)}</b></span></div><p class="small-note">${escape(check.season || 'Tamamlanmış sezon yok')} maçlarında kronolojik test. Düşük hata daha iyi. Kullanıma açılması için en az 60 yeterli örnek, %80 veri kapsamı ve hem Brier hem log loss iyileşmesinin hafta bazında %95 belirsizlik aralığında desteklenmesi gerekiyor. Hakem etkisiyle karar doğruluğu aynı ölçüm değildir. Atamalar arşivden sonradan alındı; geçmişteki açıklanma zamanları doğrulanmadı.</p>`;
  }
  $('#limitations').innerHTML = data.limitations.map(l => `<li>${escape(l)}</li>`).join('');
  $('#source-links').innerHTML = data.sources.map(s => `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.label)} ↗</a>`).join('');
  $('#source-date').textContent = `TFF verisinin alınışı: ${dateLabel(data.sourceRetrievedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}. Anlık skor yayını değildir. Model: ${data.modelVersion}. ${number(data.excludedCount)} eksik istatistikli veya hükmen maç kaydı eğitim dışında.`;
  $('#coverage-list').innerHTML = data.coverage.map(s => `<span>${s.season} · ${s.matches} maç${s.complete ? '' : ' (devam ediyor)'}</span>`).join('');
}
$('#week-select').addEventListener('change', event => setWeek(Number(event.target.value)));
$('#prev-week').addEventListener('click', () => setWeek(snapshot.round - 1));
$('#next-week').addEventListener('click', () => setWeek(snapshot.round + 1));
$('#sort-current').addEventListener('click', () => { sort = 'current'; historySelection = null; renderTable(); });
$('#sort-predicted').addEventListener('click', () => { sort = 'predicted'; historySelection = null; renderTable(); });
$('#reset-scenarios').addEventListener('click', () => { conditions = {}; renderMatches(); runScenario(); });
document.addEventListener('click', event => {
  const historyButton = event.target.closest('[data-history]');
  if (historyButton) {
    const { history: type, historyValue: value } = historyButton.dataset;
    const id = historyButton.id;
    historySelection = historySelection?.type === type && historySelection.value === value ? null : { type, value };
    renderTable();
    document.getElementById(id)?.focus({ preventScroll: true });
    return;
  }
  if (event.target.closest('[data-history-close]')) { closeStandingsHistory(); return; }
  const detail = event.target.closest('[data-detail]');
  if (detail) {
    showDetail(detail.dataset.detail);
    if (detail.classList.contains('referee-link')) $('#match-dialog .referee-analysis').scrollIntoView({ block: 'start' });
  }
  const outcome = event.target.closest('[data-match]');
  if (!outcome) return;
  const { match, outcome: result } = outcome.dataset;
  if (conditions[match] === result) delete conditions[match]; else conditions[match] = result;
  runScenario();
});
function closeStandingsHistory() {
  const id = document.querySelector('[data-history][aria-expanded="true"]')?.id;
  historySelection = null;
  renderTable();
  if (id) document.getElementById(id)?.focus({ preventScroll: true });
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && historySelection && event.target.closest('#standings-history, [data-history]')) {
    event.preventDefault(); closeStandingsHistory();
  }
});
$('#close-dialog').addEventListener('click', () => $('#match-dialog').close());
$('#match-dialog').addEventListener('click', event => { if (event.target === $('#match-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });

try {
  const response = await fetch('/data/dashboard.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  data = await response.json();
  if (!data.snapshots?.length || !data.teams?.length) throw new Error('Veri dosyasında hafta veya takım bulunamadı.');
  $('#match-count').textContent = number(data.matchCount);
  $('#week-select').innerHTML = data.snapshots.map(s => `<option value="${s.round}">${s.round}. hafta</option>`).join('');
  $('.league-label b').textContent = data.season.replace(/(\d{4})-(\d{2})(\d{2})/, '$1 / $3');
  const shared = readSharedState(new URLSearchParams(location.search), data);
  renderValidation(); setWeek(shared.round);
  if (Object.keys(shared.conditions).length) {
    conditions = shared.conditions;
    forecast = simulate(snapshot.table, snapshot.fixtures, { runs: 10000, seed: 2026 + snapshot.round, conditions, playedMatches: snapshot.playedMatches, collectConditions: true });
    projection = projectTable(snapshot.table, snapshot.fixtures, { conditions, playedMatches: snapshot.playedMatches });
    renderMatches(); renderTable();
  }
  insights = initInsights(data, { getState: () => ({ snapshot, forecast, projection, conditions, sort }) }, { escape, number, percent, dateLabel, crest }, shared.team);
  insights.render();
  if (shared.notice) $('#insight-status').textContent = shared.notice;
  $('#loading').hidden = true;
  $('#dashboard').hidden = false;
  if (location.hash === '#team-profile') $('#team-profile').scrollIntoView();
} catch (error) {
  $('#loading').textContent = 'Veriler yüklenemedi. Lütfen sayfayı yenileyin. Veri dosyası hazırlanmadıysa proje klasöründe npm run build çalıştırılmalı.';
  console.error('PTnext verileri yüklenemedi:', error);
}
