import { calibrationSummary, seasonJourney, leadershipPattern, europeanSummary, criticalMatches, scenarioUrl } from './insights-model.js';
import { comparisonWeek } from './standings-history.js';
import { squadMarkup } from './squad-view.js';

export function initInsights(data, api, format, initialTeam) {
  const { escape: e, number: n, percent: pct, dateLabel: date, crest } = format;
  const $ = selector => document.querySelector(selector);
  let favorite = null;
  try { favorite = localStorage.getItem('ptnext-favorite-team'); } catch { /* Depolama kapalıysa özellik oturum boyunca çalışır. */ }
  const teams = data.insightTeams;
  const validTeam = value => teams.some(t => t.name === value);
  const state = { team: validTeam(initialTeam) ? initialTeam : validTeam(favorite) ? favorite : data.teams[0].name,
    seasonA: data.standingsHistory.seasons[0].season, seasonB: data.standingsHistory.seasons[1].season,
    metric: 'rank', journeyWeek: 3, reportRound: data.reports.filter(r => r.completed).at(-1)?.round || data.reports.at(-1)?.round,
    goal: 'leader', patternMode: 'last-five', patternScope: 'all', europeMode: 'after-away', europeScope: 'team', calSeason: '' };
  state.calTeam = state.team;
  let lastRound, captureOpener;
  const options = (values, selected) => values.map(([value, label]) => `<option value="${e(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${e(label)}</option>`).join('');
  const teamOptions = teams.map(t => [t.name, t.name]);
  const history = { seasons: [...(data.currentJourney ? [data.currentJourney] : []), ...data.standingsHistory.seasons] };
  const seasonOptions = history.seasons.map(s => [s.season, `${s.season}${s.season === data.season ? ' · sürüyor' : ''}`]);
  const head = (id, label, title, context) => `<div class="insight-card-heading"><div><div class="eyebrow">${label}</div><h3>${e(title)}</h3></div><button class="capture-button" data-controls data-capture="${id}" aria-label="${e(title)} kartını paylaşım görünümünde aç">Kartı aç ↗</button></div><p class="insight-context">${e(context)}</p>`;
  const foot = text => `<div class="insight-card-footer"><span>PT<span>next</span> ↗</span><small>${e(text)}</small></div>`;
  const empty = text => `<div class="insight-empty"><span aria-hidden="true">—</span><p>${e(text)}</p></div>`;
  const rate = value => value === null || value === undefined ? '—' : pct(value, 1);
  const interval = value => value ? `${rate(value.low)}–${rate(value.high)}` : '—';
  const select = (id, label, values, selected) => `<label for="${id}">${label}<select id="${id}">${options(values, selected)}</select></label>`;
  const scope = () => `${data.season} · ${api.getState().snapshot.round}. hafta`;
  const mode = () => api.getState().snapshot.retrospective ? 'Geçmiş hafta canlandırması' : Object.keys(api.getState().conditions).length ? 'Kullanıcı senaryosu' : 'PTnext tahmini';
  const choices = () => Object.entries(api.getState().conditions).map(([id, outcome]) => {
    const m = api.getState().snapshot.fixtures.find(m => m.id === id);
    return { id, outcome, label: outcome === 'D' ? `${m.home}–${m.away}: beraberlik` : `${outcome === 'H' ? m.home : m.away} kazanır` };
  });
  const status = text => { $('#insight-status').textContent = text; };

  function renderProfile() {
    const { snapshot, forecast, projection } = api.getState();
    const row = snapshot.table.find(r => r.team === state.team), next = projection.table.find(r => r.team === state.team);
    const stat = forecast.find(r => r.team === state.team);
    const measured = calibrationSummary(data.validation.records, state.team);
    const fixtures = data.teamFixtures.filter(m => [m.home, m.away].includes(state.team) && m.round >= snapshot.round);
    const fixtureRow = m => {
      const pick = projection.picks.find(p => p.id === m.id);
      return `<div class="profile-fixture"><span>${m.round}. H<span>${m.date ? date(m.date) : 'Tarih verisi yok'}</span></span><b>${e(m.home)}<span>${e(m.away)}</span></b><strong>${m.homeGoals !== null ? `${m.homeGoals}–${m.awayGoals}<small>Sonuç</small>` : pick ? `${pick.homeGoals}–${pick.awayGoals}<small>Tahmin</small>` : '—'}</strong></div>`;
    };
    $('#profile-card').innerHTML = head('profile-card', 'TAKIMININ HAFTASI', state.team, `${scope()} · ${mode()}`)
      + (row ? `<div class="profile-score"><div>${crest(state.team)}<span>Mevcut<strong>${row.points}<small>puan</small></strong><b>${row.rank}. sıra · ${row.played} maç</b></span></div><span class="score-arrow" aria-hidden="true">→</span><div><span>${snapshot.round}. hafta sonu<strong>${next.points}<small>puan</small></strong><b>${next.rank}. sıra · ${next.played} maç</b></span></div></div>
        <div class="distribution-title"><span>Hafta sonu sıra olasılıkları</span><b>%80 aralık: ${stat.rankLow}–${stat.rankHigh}</b></div><div class="rank-distribution" role="img" aria-label="${e(state.team)} sıra dağılımı; yüzde 80 aralığı ${stat.rankLow} ile ${stat.rankHigh}">${stat.ranks.map((count, i) => `<div title="${i + 1}. sıra: ${pct(count / stat.ranks.reduce((a, b) => a + b, 0), 1)}"><i style="height:${Math.max(2, count / Math.max(...stat.ranks) * 62)}px;opacity:${count ? 1 : .12}"></i><span>${i + 1}</span></div>`).join('')}</div><p class="insight-note">Puanlar seçili skorlardan, sıra olasılıkları 10.000 senaryodan hesaplanır.</p>` : empty('Bu takım seçili sezonda Süper Lig puan tablosunda bulunmuyor. Geçmiş sezonlarını yan taraftan inceleyebilirsin.'))
      + `<div class="profile-evidence"><span>Geçmiş test · ${data.validation.bySeason.map(s => s.season).join(' / ')}</span><strong>${measured.count ? `${measured.correct} / ${measured.count} doğru maç sonucu` : 'Bu takım için test örneği yok'}</strong></div>`
      + (choices().length ? `<p class="insight-note">Seçimlerin: ${choices().map(c => e(c.label)).join(' · ')}</p>` : '')
      + (fixtures.length ? `<h4 class="insight-small-title">Takımın fikstürü</h4>${fixtures.slice(0, 3).map(fixtureRow).join('')}<details data-controls><summary>Kalan fikstürü göster (${fixtures.length} maç)</summary>${fixtures.slice(3).map(fixtureRow).join('')}</details>` : '')
      + foot(`${mode()} · ${date(data.sourceRetrievedAt, { day: 'numeric', month: 'short', year: 'numeric' })}`);
  }

  function renderSquad() {
    const { snapshot } = api.getState();
    const match = snapshot.fixtures.find(m => m.home === state.team || m.away === state.team);
    $('#squad-card').innerHTML = head('squad-card', 'KADRO VE EKSİKLER', `${state.team} · sahaya kim çıkabilir?`, `${scope()} · Son ilk 11 ve doğrulanmış haberler`)
      + (match ? squadMarkup(match, data.squadValidation, { escape: e, number: n, percent: pct }, state.team) : empty('Bu hafta için oynanmamış takım maçı veya kayıtlı kadro incelemesi yok.'))
      + foot('PTnext · TFF kadro arşivi + kaynaklı oyuncu durumları');
  }

  function renderJourney() {
    const series = [state.seasonA, state.seasonB].filter(Boolean).map(season => ({ season, points: seasonJourney(history, season, state.team) }));
    const maxWeek = Math.max(1, ...series.map(s => s.points.length));
    state.journeyWeek = Math.min(maxWeek, state.journeyWeek);
    const allRows = series.flatMap(s => s.points.flatMap(p => p.row ? [p.row] : []));
    const ranks = state.metric === 'rank';
    const maximum = ranks ? Math.max(18, ...series.map(s => history.seasons.find(h => h.season === s.season).teams.length)) : Math.max(10, ...allRows.map(r => r.points));
    const minimum = ranks ? 1 : Math.min(0, ...allRows.map(r => r.points));
    const x = week => 34 + (week - 1) / Math.max(1, maxWeek - 1) * 478;
    const y = value => ranks ? 25 + (value - minimum) / (maximum - minimum) * 156 : 181 - (value - minimum) / (maximum - minimum) * 156;
    const ticks = ranks ? [1, 5, 10, 15, maximum] : [minimum, Math.round((maximum + minimum) / 2), maximum];
    const lines = series.map((s, index) => {
      let continuing = false;
      const path = s.points.map(p => { if (!p.row) { continuing = false; return ''; } const point = `${continuing ? 'L' : 'M'}${x(p.week)} ${y(p.row[state.metric])}`; continuing = true; return point; }).join(' ');
      return `<path d="${path}" fill="none" stroke="${index ? '#8396ad' : '#2166e8'}" stroke-width="${index ? 2 : 3}" ${index ? 'stroke-dasharray="6 4"' : ''}/>${s.points.filter(p => p.row).map(p => `<circle cx="${x(p.week)}" cy="${y(p.row[state.metric])}" r="${p.week === state.journeyWeek ? 4.5 : 2}" fill="${index ? '#8396ad' : '#2166e8'}"><title>${e(s.season)} · ${p.week}. hafta: ${p.row.rank}. sıra, ${p.row.points} puan</title></circle>`).join('')}`;
    }).join('');
    $('#journey-card').innerHTML = head('journey-card', 'SEZONUN İZİ', `${state.team} · hafta hafta`, `${state.seasonA}${state.seasonB ? ` / ${state.seasonB}` : ''} · ${ranks ? 'Sıralama' : 'Puan'} karşılaştırması`)
      + `<div class="card-filters" data-controls>${select('journey-season-a', 'Sezon', seasonOptions, state.seasonA)}${select('journey-season-b', 'Karşılaştır', [['', 'Tek sezon'], ...seasonOptions], state.seasonB)}${select('journey-metric', 'Göster', [['rank', 'Sıra'], ['points', 'Puan']], state.metric)}</div>`
      + (allRows.length ? `<svg class="journey-chart" viewBox="0 0 540 215" role="img" aria-label="${e(state.team)} ${e(state.seasonA)} ${e(state.seasonB)} hafta hafta ${ranks ? 'sıra' : 'puan'} grafiği">${ticks.map(t => `<path d="M34 ${y(t)}H512" stroke="#e4e9ee"/><text x="22" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}<path d="M${x(state.journeyWeek)} 20V185" stroke="#c3d6f6" stroke-dasharray="3 4"/>${lines}${[1, 10, 20, 30, maxWeek].filter((v, i, a) => v <= maxWeek && a.indexOf(v) === i).map(w => `<text x="${x(w)}" y="204" text-anchor="middle">${w}. H</text>`).join('')}</svg>
        <div class="journey-scrubber" data-controls><label for="journey-week">${state.journeyWeek}. haftayı incele</label><input id="journey-week" type="range" min="1" max="${maxWeek}" value="${state.journeyWeek}"></div><div class="journey-readout">${series.map((s, i) => { const p = s.points[state.journeyWeek - 1]; return `<div><span><i class="series-key ${i ? 'secondary' : ''}"></i>${e(s.season)}</span><strong>${p?.row ? `${p.row.rank}. sıra <small>· ${p.row.points} puan</small>` : 'Hafta kaydı yok'}</strong><small>${state.journeyWeek}. hafta${p?.row ? ` · ${p.row.played} maç` : ''}</small></div>`; }).join('')}</div>` : empty('Bu takım seçilen sezonlarda Süper Lig’de yer almıyor. Başka bir sezon seç.'))
      + `<p class="insight-note">${ranks ? 'Grafikte yukarı çıkmak, ligde yükselmek demek. ' : ''}TFF hafta arşivi; ertelenen maçların sonradan işlenen sonuçlarını içerebilir. Eksik haftalar birleştirilmez.</p>`
      + `<details data-controls><summary>Grafiğin sayısal kayıtları ve kaynakları</summary><div class="journey-records">${series.map(s => `<h4>${e(s.season)}</h4>${s.points.filter(p => p.row).map(p => `<a href="${e(p.source)}" target="_blank" rel="noopener noreferrer">${p.week}. hafta · ${p.row.rank}. sıra · ${p.row.points} puan ↗</a>`).join('')}`).join('')}</div></details>` + foot('TFF · Haftalık cetveller / gerçekleşen sonuçlar');
  }

  function renderCritical() {
    const { snapshot, forecast, conditions } = api.getState();
    const stat = forecast.find(r => r.team === state.team);
    const list = criticalMatches(stat, snapshot.fixtures, state.goal).slice(0, 3);
    const target = { leader: 'Liderlik', top4: 'İlk 4', up: 'Sıra yükseltme' }[state.goal];
    $('#critical-card').innerHTML = head('critical-card', 'TABLOYU DEĞİŞTİREN MAÇLAR', `${state.team} için hangi sonuç önemli?`, `${scope()} · Hedef: ${target} · ${mode()}`)
      + `<div class="card-filters" data-controls>${select('critical-goal', 'Hafta sonu hedefi', [['leader', 'Liderlik'], ['top4', 'İlk 4'], ['up', 'Sıra yükseltme']], state.goal)}<p>Bir sonuca tıklayarak ana tablodaki senaryona ekleyebilirsin.</p></div>`
      + (choices().length ? `<div class="condition-chips">${choices().map(c => `<button data-match="${e(c.id)}" data-outcome="${c.outcome}" aria-pressed="true" aria-label="${e(c.label)} seçimini kaldır">${e(c.label)} <span aria-hidden="true">×</span></button>`).join('')}</div>` : '')
      + (list.length ? `<div class="critical-grid">${list.map(({ match, outcomes, spread }) => `<div class="critical-match"><div class="critical-match-title"><h4>${e(match.home)}<span>${e(match.away)}</span></h4><span>${n(spread * 100, 1)}<small>yüzde puan fark</small></span></div><p>${target} ihtimali · maç sonucu koşuluyla</p>${outcomes.map(r => `<button class="impact-outcome" data-match="${e(match.id)}" data-outcome="${r.outcome}" aria-pressed="${conditions[match.id] === r.outcome}" aria-label="${e(r.outcome === 'H' ? match.home + ' kazanır' : r.outcome === 'A' ? match.away + ' kazanır' : 'Beraberlik')}; ${e(state.team)} ${target} ihtimali ${rate(r.probability)}"><span>${r.outcome === 'H' ? 'Ev sahibi kazanır' : r.outcome === 'A' ? 'Deplasman kazanır' : 'Beraberlik'}</span><strong>${rate(r.probability)}</strong><i style="width:${r.probability * 100}%"></i></button>`).join('')}<small>${outcomes.map(r => `${r.outcome === 'H' ? '1' : r.outcome === 'D' ? 'X' : '2'}: ${n(r.count)} senaryo`).join(' · ')}</small></div>`).join('')}</div>` : empty(stat ? 'Bu hedef için karşılaştırılabilecek serbest maç sonucu kalmadı veya örnek sayısı yetersiz.' : 'Bu takımın seçili haftada Süper Lig tahmini bulunmuyor.'))
      + `<p class="insight-note">Diğer maçlar mevcut model olasılıklarıyla simüle edilir; senin seçimlerin korunur. En az 30 örnekli sonuçlar karşılaştırılır. Farklar yaklaşık simülasyon sonuçlarıdır; maç kazanma yüzdesi değildir.</p>` + foot(`${scope()} · 10.000 senaryo · ${target}`);
  }

  function renderReport() {
    const report = data.reports.find(r => r.round === Number(state.reportRound));
    const recorded = data.reports.filter(r => r.kind === 'recorded' && r.completed);
    const label = report?.kind === 'recorded' ? 'Maç öncesi kayıt' : 'Geçmiş hafta canlandırması';
    const row = r => `<div role="row"><span role="cell">${e(r.team)}</span><span role="cell">${r.predictedRank} → <b>${r.rank}</b></span><span role="cell">${r.predictedPoints} → <b>${r.points}</b></span><span role="cell" class="${r.rankError ? '' : 'report-hit'}">${r.rankError ? `${r.rankError} sıra` : '✓'}</span></div>`;
    const table = rows => `<div class="report-table" role="table" aria-label="Tahmini ve gerçekleşen sıra ve puanlar"><div role="row"><span role="columnheader">TAKIM</span><span role="columnheader">SIRA T → G</span><span role="columnheader">PUAN T → G</span><span role="columnheader">SAPMA</span></div>${rows.map(row).join('')}</div>`;
    $('#weekly-report-card').innerHTML = head('weekly-report-card', 'HAFTANIN KARNESİ', 'Ne dedik, ne oldu?', `${data.season} · ${report?.round || '—'}. hafta · ${label}`)
      + `<div class="card-filters" data-controls>${select('report-week', 'Karşılaştırılacak hafta', data.reports.map(r => [r.round, `${r.round}. hafta · ${r.kind === 'recorded' ? 'Kayıtlı' : 'Canlandırma'}${r.completed ? '' : ' · bekleniyor'}`]), state.reportRound)}</div>`
      + (report?.completed ? `<div class="insight-metrics"><div><strong>${report.exactRanks}<small>/${report.rows.length}</small></strong><span>Doğru sıra</span></div><div><strong>${report.exactPoints}<small>/${report.rows.length}</small></strong><span>Doğru puan</span></div><div><strong>${n(report.meanRankError, 1)}</strong><span>Ortalama sıra sapması</span></div></div>${table(report.rows.slice(0, 6))}<p class="insight-note">İlk 6 takım · T: tahmin, G: gerçekleşen. ${report.correctResults}/${report.matches} maçta doğru 1/X/2 sonucu.</p><details data-controls><summary>Bütün takımların karşılaştırmasını aç</summary>${table(report.rows)}</details>` : empty('Bu haftanın bütün maçları tamamlandığında kayıtlı tahmin, gerçek TFF cetveliyle otomatik karşılaştırılacak.'))
      + `<p class="insight-note report-provenance">${report?.kind === 'recorded' ? 'Tahmin hafta başlamadan kaydedildi; sonuçlar tahmini değiştirmez.' : 'Bu hafta için maç öncesi kayıt yok. Gösterilen tahmin geçmiş veriden sonradan hesaplandı; canlı başarıya dahil edilmez.'} ${recorded.length ? `${recorded.length} tamamlanmış kayıtlı hafta var.` : 'Henüz sonuçlanmış kayıtlı hafta yok.'}</p>`
      + (report ? `<a class="insight-source" href="${e(report.source)}" target="_blank" rel="noopener noreferrer">TFF gerçekleşen hafta cetveli ↗</a>` : '') + foot(`${data.season} · ${report?.round || '—'}. hafta · ${label}`);
  }

  function renderPatterns() {
    const team = state.patternScope === 'team' ? state.team : '';
    const result = leadershipPattern(data.standingsHistory, state.patternMode, team);
    const title = state.patternMode === 'last-five' ? 'Son 5 haftaya lider giren…' : '3. haftanın lideri…';
    $('#patterns-card').innerHTML = head('patterns-card', 'LİGİN HAFIZASI', title, `${team || 'Lig geneli'} · ${data.standingsHistory.seasons.at(-1).season} — ${data.standingsHistory.seasons[0].season}`)
      + `<div class="card-filters" data-controls>${select('pattern-mode', 'Gözlem', [['last-five', 'Son 5 haftaya lider giriş'], ['week-three', '3. hafta liderliği']], state.patternMode)}${select('pattern-scope', 'Kapsam', [['all', 'Lig geneli'], ['team', state.team]], state.patternScope)}</div>`
      + (result.count ? `<div class="pattern-highlight"><strong>${result.wins}<span> / ${result.count}</span></strong><div>sezonu şampiyon bitirdi.<b>${rate(result.rate)} gözlenen oran</b></div></div><div class="pattern-strip">${result.rows.map(r => `<div title="${e(r.team)}: ${r.week}. hafta lider, sezon sonu ${r.finalRank}. sıra"><span>${r.season.slice(2).replace('-20', '/')}</span><b class="${r.finalRank === 1 ? 'champion' : ''}">${r.finalRank === 1 ? '✓' : r.finalRank + '.'}</b><small>${e((teams.find(t => t.name === r.team)?.short) || r.team)}</small></div>`).join('')}</div><p class="insight-note">✓ Şampiyonluk · %95 belirsizlik aralığı ${interval(result.interval)}. ${result.count < 20 ? 'Örnek az; bu oran geleceğin kazanma ihtimali değildir.' : ''}</p><details data-controls><summary>Sezonları ve kaynakları incele</summary><div class="pattern-cases">${result.rows.map(r => `<p><a href="${e(r.source)}" target="_blank" rel="noopener noreferrer">${r.season} · ${r.week}. hafta · ${e(r.team)} ${r.points} puan ↗</a><a href="${e(r.finalSource)}" target="_blank" rel="noopener noreferrer">Sezon sonu ${r.finalRank}. sıra · ${r.finalPoints} puan ↗</a></p>`).join('')}</div></details>` : empty('Seçilen takım için bu koşulu sağlayan sezon bulunmadı. Bu, gelecekte gerçekleşmeyeceği anlamına gelmez.'))
      + `<p class="insight-note">Son 5 haftaya giriş, fikstürün son haftasından 5 hafta önceki cetveldir. Tarihsel ilişki ölçülür; tahmine otomatik kural eklenmez.</p>` + foot('TFF · Tamamlanmış son 10 sezon');
  }

  function renderEurope() {
    const team = state.europeScope === 'team' ? state.team : '';
    const result = europeanSummary(data.europe.cases, state.europeMode, team);
    const title = { 'after-away': 'Avrupa deplasmanından sonra', after: 'Avrupa maçından sonra', before: 'Avrupa maçından önce' }[state.europeMode];
    const change = result.pairedCount ? result.pairedPoints - result.controlPoints : null;
    $('#europe-card').innerHTML = head('europe-card', 'TAKVİMİN İZİ', `${team || 'Türk takımları'} · ${title}`, `${data.europe.scope} Lig maçları için 1–4 takvim günü aralığı.`)
      + `<div class="card-filters" data-controls>${select('europe-mode', 'Dönem', [['after-away', 'Avrupa deplasmanı sonrası'], ['after', 'Avrupa maçı sonrası'], ['before', 'Avrupa maçı öncesi']], state.europeMode)}${select('europe-scope', 'Takım', [['team', state.team], ['all', 'Tüm Türk takımları']], state.europeScope)}</div>`
      + (result.count ? `<div class="europe-layout"><div><div class="insight-metrics"><div><strong>${result.count}</strong><span>Lig maçı</span></div><div><strong>${result.wins}</strong><span>Galibiyet</span></div><div><strong>${rate(result.winRate)}</strong><span>Galibiyet oranı</span></div></div><p class="insight-note">${result.count - result.wins} maçta puan kaybı · Galibiyet oranının %95 belirsizlik aralığı ${interval(result.interval)}.</p></div><div class="europe-bars">${result.pairedCount ? [[title, result.pairedPoints], ['Eşleştirilmiş diğer lig maçları', result.controlPoints]].map(([label, value], i) => `<div><span>${e(label)}<b>${n(value, 2)} puan / maç</b></span><div><i class="${i ? 'secondary' : ''}" style="width:${value / 3 * 100}%"></i></div></div>`).join('') + `<p><strong>${change > 0 ? '+' : ''}${n(change, 2)}</strong> puan / maç farkı · ${result.pairedCount} eşleşen örnek, ${result.controlCount} farklı karşılaştırma maçı.</p>` : empty('Aynı takım, sezon ve saha için karşılaştırma örneği yok.')}</div></div>
        <details data-controls><summary>${result.count} lig maçı ve ilişkili Avrupa kayıtları</summary><div class="europe-cases">${[...result.rows].sort((a, b) => b.date.localeCompare(a.date)).map(r => { const eu = state.europeMode === 'before' ? r.before : r.after; return `<div><span>${date(r.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${e(r.team)} — ${e(r.opponent)} · ${r.home ? 'İç saha' : 'Deplasman'}</span><b>${r.score} · ${r.points} puan</b><a href="${e(eu.source)}" target="_blank" rel="noopener noreferrer">Avrupa: ${eu.date} · ${e(eu.opponent)} · ${eu.away ? 'deplasman' : 'iç saha'} ↗</a></div>`; }).join('')}</div></details>` : empty('Seçilen koşulda kayıtlı maç yok. Bu takımın Avrupa performansı için oran üretilemiyor.'))
      + `<p class="insight-note">Karşılaştırma aynı takım, sezon ve ligdeki saha durumuyla eşleştirilir; Avrupa maçlarının 4 gün öncesi/sonrası dışındaki maçlar kullanılır. Rakip gücü, rotasyon ve sakatlık ayrıştırılmadı. Bu fark nedensellik veya doğrudan tahmin düzeltmesi değildir.</p>` + foot('OpenFootball + lig sonuç arşivi · 2020–2025 / elemeler hariç');
  }

  function renderReliability() {
    const result = calibrationSummary(data.validation.records, state.calTeam, state.calSeason);
    $('#reliability-card').innerHTML = head('reliability-card', 'YÜZDELERİN KARNESİ', 'Söylediğimiz olasılık, gerçekleşen sonuç.', `${state.calTeam || 'Lig geneli'} · ${state.calSeason || data.validation.bySeason.map(s => s.season).join(' / ')} · Geçmiş dönem testi`)
      + `<div class="card-filters" data-controls>${select('reliability-team', 'Takım', [['', 'Lig geneli'], ...teamOptions], state.calTeam)}${select('reliability-season', 'Dönem', [['', 'Tüm test dönemi'], ...data.validation.bySeason.map(s => [s.season, s.season])], state.calSeason)}</div>`
      + (result.count ? `<div class="reliability-summary"><strong>${result.correct}<small> / ${result.count}</small></strong><span>doğru 1/X/2 sonucu<b>${rate(result.accuracy)} isabet</b></span></div><div class="reliability-legend"><span><i></i>Model olasılığı</span><span><i></i>Gerçekleşen isabet</span></div><div class="reliability-chart">${result.bins.filter(b => b.count).map(b => `<div class="reliability-row"><span>${n(b.low * 100)}–${n((b.low + .1) * 100)}%</span><div class="reliability-bars"><div><i style="width:${b.confidence * 100}%"></i><b>${rate(b.confidence)}</b></div><div><i style="width:${b.accuracy * 100}%"></i><b>${rate(b.accuracy)}</b></div></div><span>${b.count} maç<small>${b.count < 20 ? 'Az örnek' : '%95 aralık'}</small></span><p>Gerçekleşen isabetin %95 aralığı: ${interval(b.interval)}</p></div>`).join('')}</div><p class="insight-note">Genel isabetin %95 belirsizlik aralığı ${interval(result.interval)}. Yüzdeler, takımın galibiyetini değil modelin en olası gördüğü 1/X/2 sonucunu değerlendirir. Az örnekli gruplarda kesin yargıya varılmaz.</p>` : empty('Seçilen takım ve dönem için test maçı yok. Diğer takım veya dönemleri seçebilirsin.'))
      + foot('Maçlar kronolojik test edildi · Maç sonrası veri kullanılmadı');
  }

  function render() {
    const { snapshot, conditions } = api.getState();
    const sharedField = $('#share-link-fallback');
    if (!sharedField.hidden && sharedField.value !== scenarioUrl(location.origin, data.season, snapshot, state.team, conditions)) {
      sharedField.hidden = true; sharedField.value = '';
      status('Senaryo değişti. Güncel seçimlerini paylaşmak için bağlantıyı yeniden kopyala.');
    }
    if (new URLSearchParams(location.search).has('team')) document.title = `${state.team} · ${snapshot.round}. hafta analizi | PTnext`;
    if (lastRound !== snapshot.round) { state.journeyWeek = Math.max(1, comparisonWeek(snapshot, 'current')); lastRound = snapshot.round; }
    $('#profile-team').innerHTML = options(teamOptions, state.team);
    $('#favorite-team').setAttribute('aria-pressed', String(favorite === state.team));
    $('#favorite-team').textContent = favorite === state.team ? '★ Takımın olarak kayıtlı' : '☆ Takımım olarak kaydet';
    renderProfile(); renderSquad(); renderJourney(); renderCritical(); renderReport(); renderPatterns(); renderEurope(); renderReliability();
  }

  $('#profile-team').addEventListener('change', event => {
    state.team = event.target.value; state.calTeam = state.team;
    const url = new URL(location.href); url.searchParams.set('team', state.team); historyReplace(url); render();
  });
  function historyReplace(url) { window.history.replaceState(null, '', url); }
  $('#favorite-team').addEventListener('click', () => {
    favorite = favorite === state.team ? null : state.team;
    try { if (favorite) localStorage.setItem('ptnext-favorite-team', favorite); else localStorage.removeItem('ptnext-favorite-team'); status(favorite ? `${favorite} bu tarayıcıda takımın olarak kaydedildi.` : 'Takım kaydı kaldırıldı.'); }
    catch { status('Tarayıcı kalıcı kayda izin vermiyor; takım seçimin bu oturumda korunuyor.'); }
    render();
  });
  $('#share-scenario').addEventListener('click', async () => {
    const { snapshot, conditions } = api.getState();
    const url = scenarioUrl(location.origin, data.season, snapshot, state.team, conditions);
    $('#share-link-fallback').value = url; $('#share-link-fallback').hidden = false;
    try { await navigator.clipboard.writeText(url); status('Takım, hafta ve maç seçimlerini içeren bağlantı kopyalandı.' + (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? ' Site şu an yerelde; bağlantı dışarıdan erişilebilmesi için yayımlanmalı.' : '')); }
    catch { const field = $('#share-link-fallback'); field.hidden = false; field.value = url; field.focus(); field.select(); status('Bağlantıyı bu alandan kopyalayabilirsin.'); }
  });
  const controls = { 'journey-season-a': 'seasonA', 'journey-season-b': 'seasonB', 'journey-metric': 'metric', 'journey-week': 'journeyWeek',
    'critical-goal': 'goal', 'report-week': 'reportRound', 'pattern-mode': 'patternMode', 'pattern-scope': 'patternScope',
    'europe-mode': 'europeMode', 'europe-scope': 'europeScope', 'reliability-team': 'calTeam', 'reliability-season': 'calSeason' };
  document.addEventListener('change', event => {
    const key = controls[event.target.id]; if (!key) return;
    const id = event.target.id; state[key] = id === 'journey-week' ? Number(event.target.value) : event.target.value;
    render(); document.getElementById(id)?.focus({ preventScroll: true });
  });
  document.addEventListener('click', event => {
    const journey = event.target.closest('[data-journey-season]');
    if (journey && validTeam(journey.dataset.journeyTeam)) {
      state.team = journey.dataset.journeyTeam; state.calTeam = state.team; state.seasonA = journey.dataset.journeySeason;
      if (state.seasonB === state.seasonA) state.seasonB = '';
      const url = new URL(location.href); url.searchParams.set('team', state.team); historyReplace(url); render(); $('#journey-card').scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const capture = event.target.closest('[data-capture]');
    if (!capture) return;
    const card = document.getElementById(capture.dataset.capture);
    if (!card) return;
    captureOpener = capture;
    const clone = card.cloneNode(true);
    for (const control of clone.querySelectorAll('[data-controls], details')) control.remove();
    for (const element of [clone, ...clone.querySelectorAll('[id], [aria-labelledby]')]) { element.removeAttribute('id'); element.removeAttribute('aria-labelledby'); }
    // Paylaşım görünümünde düğmeler görüntüye dönüşür; senaryoya ikinci kez olay bağlanmaz.
    for (const button of clone.querySelectorAll('button')) { const div = document.createElement('div'); div.className = button.className; div.innerHTML = button.innerHTML; button.replaceWith(div); }
    clone.classList.add('capture-card'); $('#capture-content').replaceChildren(clone); $('#card-dialog').showModal();
  });
  $('#close-card-dialog').addEventListener('click', () => $('#card-dialog').close());
  $('#card-dialog').addEventListener('close', () => captureOpener?.focus({ preventScroll: true }));
  return { render };
}
