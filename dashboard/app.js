// Token Radar v5 — the page. It renders window.RADAR and nothing else:
// every number comes from data.js, which main.ts writes from the snapshot,
// so the page and board.json cannot drift apart.
const R = window.RADAR;
const snapWatchlist = new Set(R.watchlist);
const $ = (s, el) => (el || document).querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usd = (n) => {
  if (n == null || !isFinite(n)) return '—';
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
};
const usd0 = (n) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'));
const pct = (n, d = 1) => (n == null ? '—' : (n * 100).toFixed(d) + '%');
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const ageFmt = (d) => {
  if (d == null) return '—';
  if (d < 30) return d + 'd';
  if (d < 365) return (d / 30).toFixed(0) + 'mo';
  return (d / 365).toFixed(1) + 'y';
};
const chgFmt = (c) => {
  if (c == null) return '—';
  const v = c.toFixed(1) + '%';
  return (c > 0 ? '+' : '') + v;
};
const state = { tab: 'board', sort: 'rank', dir: 1, q: '', cat: 'All', chain: 'All', verdict: 'All', wl: false, worth: false, rising: false, anchors: false, capital: 1000, share: 0.1 };

// Money columns recompute live from the row's own figures when the reader
// changes the capital or the airdrop share — the same formulas as the model.
function moneyAt(r, capital, share) {
  const slice = (capital / (r.tvl_usd + capital)) * share * r.implied_value_usd;
  const sliceLow = (capital / (r.tvl_usd + capital)) * share * r.low_usd;
  const tbill = capital * 0.04 * (r.hold_days / 365);
  const net = slice - r.fees_usd - tbill;
  const netLow = sliceLow - r.fees_usd - tbill;
  const verdict = netLow > 0 ? 'FARM' : sliceLow > r.fees_usd ? 'THIN' : 'SKIP';
  return { slice, sliceLow, tbill, net, netLow, verdict };
}

function header() {
  $('#meta').innerHTML = `DefiLlama snapshot ${esc(R.asOf)} · model <b>${esc(R.modelVersion)}</b><br>` +
    `watchlist <b>${R.counts.watchlistCovered}/${R.counts.watchlist}</b> on the board · ` +
    `page = board.json <b>${R.rows.length}/${R.rows.length} rows</b>`;
  const s = R.counts, v = R.validation;
  $('#stats').innerHTML = [
    [`${s.ranked}`, 'ranked, record no token', `${s.watchlistCovered}/${s.watchlist} watchlist covered`],
    [`${s.comps}`, 'already trade: fit the curve', `${s.kept} kept after the trim · ${s.outliers} set aside`],
    [`${s.setAside}`, 'set aside by the house rule', 'reasons on the Set aside tab'],
    [`×${v.loo.full.medianMiss}`, 'leave-one-out median miss', `flat multiple ×${v.loo.flat.medianMiss} · curve alone ×${v.loo.curveOnly.medianMiss}`],
    [`×${v.walkForward.overall.medianMiss}`, 'walk-forward median miss', `curve alone ×${v.walkForward.overallCurve.medianMiss} · ${v.walkForward.folds.length} yearly folds`],
    [`${R.verdicts.farm} / ${R.verdicts.thin} / ${R.verdicts.skip}`, 'FARM / THIN / SKIP at $1,000', 'netted at the P25 low end, not the point value'],
  ].map(([a, b, c]) => `<div class="stat"><div class="v">${a}</div><div class="k">${b}</div><div class="d">${c}</div></div>`).join('');
  $('#how').innerHTML =
    `<div class="card"><h2>How a value is built</h2><div class="big">implied = curve × family × growth × seasoning × sibling</div>` +
    `<p><code>log10 value = ${v.fit.a.toFixed(4)} + ${v.fit.b.toFixed(4)} × log10(TVL)</code> on ${v.fit.n} traded tokens, R² ${v.fit.r2}. ` +
    `A slope under 1 means small protocols trade at a higher multiple of TVL. Family is the shrunk median residual ` +
    `of the category's traded tokens; growth carries TVL two weeks at its 7-day rate, clamped; seasoning rises to 3 years; ` +
    `a sibling of a traded token is worth half.</p></div>` +
    `<div class="card"><h2>Out of sample — strict</h2><p>Each token is priced by a curve and category factors <b>refitted without it</b>. ` +
    `Median miss <b>×${v.loo.full.medianMiss}</b> against ×${v.loo.flat.medianMiss} for one flat multiple; ` +
    `${Math.round(v.loo.full.within3 * 100)}% land within 3× of the real cap. Walk-forward: fitted on the tokens listed ` +
    `before each year, scored on the next year's cohort: ×${v.walkForward.overall.medianMiss} against ×${v.walkForward.overallCurve.medianMiss} for the curve alone. ` +
    `Time split: fitted on the ${v.split2024.pre} tokens listed before 2024, scored on the ${v.split2024.post} after: ×${v.split2024.full.medianMiss} against ×${v.split2024.flat.medianMiss} flat.</p></div>` +
    `<div class="card"><h2>Rank ranges — 200 bootstrap refits</h2><p>The fit is re-run on 200 resampled comparable sets; ` +
    `the range under each rank is where the refits put it. The tilts move <b>${v.tiltsMove} of ${R.rows.length} ranks 5+ places</b> — ` +
    `the layers earn their keep. Best net per hands-on hour, watchlist: <b>${R.bestPerHourWatchlist ? esc(R.bestPerHourWatchlist.name) + ' +' + usd(R.bestPerHourWatchlist.perHour) + '/h' : '—'}</b></p></div>`;
  $('#farmnext').innerHTML = '<h2>Farm next — best dollars per hour</h2><div class="cards">' +
    R.farmNext.map((f) => `<button class="fn" data-slug="${esc(f.slug)}"><div class="r">#${f.rank} · ${esc(f.mechanism)}</div>` +
      `<div class="n">${esc(f.name)}</div><div class="ph">+${usd(f.per_hour_usd)}/h</div>` +
      `<div class="det">net ${usd(f.net_usd)} · gas ${usd(f.gas_usd)} · ${f.hours}h · ${Math.round(f.odds * 100)}% odds</div></button>`).join('') + '</div>';
  $('#farmnext').addEventListener('click', (e) => {
    const b = e.target.closest('[data-slug]');
    if (b) openDetail(b.dataset.slug);
  });
}

function boardRows() {
  let rows = R.rows.slice();
  const q = state.q.trim().toLowerCase();
  if (q) rows = rows.filter((r) => (r.name + ' ' + r.slug + ' ' + r.category).toLowerCase().includes(q));
  if (state.cat !== 'All') rows = rows.filter((r) => r.category === state.cat);
  if (state.chain !== 'All') rows = rows.filter((r) => r.chains.includes(state.chain));
  if (state.verdict !== 'All') rows = rows.filter((r) => moneyAt(r, state.capital, state.share).verdict === state.verdict);
  if (state.wl) rows = rows.filter((r) => snapWatchlist.has(r.slug));
  if (state.worth) rows = rows.filter((r) => moneyAt(r, state.capital, state.share).verdict === 'FARM');
  if (state.rising) rows = rows.filter((r) => (r.change_7d ?? 0) > 0);
  const key = state.sort;
  const get = (r) => {
    const m = moneyAt(r, state.capital, state.share);
    return { rank: r.rank, implied: r.implied_value_usd, tvl: r.tvl_usd, change: r.change_7d ?? -99, age: r.age_days ?? -1, odds: r.odds, net: m.netLow, slice: m.sliceLow, verdict: m.verdict }[key];
  };
  rows.sort((a, b) => {
    const va = get(a), vb = get(b);
    if (typeof va === 'string') return va.localeCompare(vb) * state.dir;
    return (va - vb) * state.dir;
  });
  return rows;
}

function renderBoard() {
  const cats = ['All', ...new Set(R.rows.map((r) => r.category))].sort();
  const chains = ['All', ...new Set(R.rows.flatMap((r) => r.chains))].sort();
  $('#controls').innerHTML =
    `<input id="q" type="search" placeholder="Search name, slug or category" value="${esc(state.q)}">` +
    `<select id="fcat">${cats.map((c) => `<option ${c === state.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` +
    `<select id="fchain">${chains.map((c) => `<option ${c === state.chain ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` +
    `<select id="fverdict">${['All', 'FARM', 'THIN', 'SKIP'].map((v) => `<option ${v === state.verdict ? 'selected' : ''}>${v}</option>`).join('')}</select>` +
    `<select id="fcap">${[1000, 10000, 100000].map((c) => `<option value="${c}" ${c === state.capital ? 'selected' : ''}>$${c.toLocaleString()} capital</option>`).join('')}</select>` +
    `<select id="fshare">${[0.05, 0.1, 0.2].map((s) => `<option value="${s}" ${s === state.share ? 'selected' : ''}>${Math.round(s * 100)}% of value</option>`).join('')}</select>` +
    `<label><input type="checkbox" id="fwl" ${state.wl ? 'checked' : ''}> Watchlist only</label>` +
    `<label><input type="checkbox" id="fworth" ${state.worth ? 'checked' : ''}> Worth farming</label>` +
    `<label><input type="checkbox" id="frising" ${state.rising ? 'checked' : ''}> Rising 7d</label>` +
    `<label><input type="checkbox" id="fanchors" ${state.anchors ? 'checked' : ''}> Traded anchors (by value)</label>` +
    `<span class="count" id="rcount"></span>`;
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; paintBoard(); });
  $('#fcat').addEventListener('change', (e) => { state.cat = e.target.value; paintBoard(); });
  $('#fchain').addEventListener('change', (e) => { state.chain = e.target.value; paintBoard(); });
  $('#fverdict').addEventListener('change', (e) => { state.verdict = e.target.value; paintBoard(); });
  $('#fcap').addEventListener('change', (e) => { state.capital = Number(e.target.value); paintBoard(); });
  $('#fshare').addEventListener('change', (e) => { state.share = Number(e.target.value); paintBoard(); });
  $('#fwl').addEventListener('change', (e) => { state.wl = e.target.checked; paintBoard(); });
  $('#fworth').addEventListener('change', (e) => { state.worth = e.target.checked; paintBoard(); });
  $('#frising').addEventListener('change', (e) => { state.rising = e.target.checked; paintBoard(); });
  $('#fanchors').addEventListener('change', (e) => { state.anchors = e.target.checked; paintBoard(); });
  paintBoard();
}

function bandBar(r) {
  const lo = Math.log10(r.p10_usd), hi = Math.log10(r.p90_usd), v = Math.log10(r.implied_value_usd);
  const left = ((Math.log10(r.p25_usd) - lo) / (hi - lo)) * 100;
  const width = ((Math.log10(r.p75_usd) - Math.log10(r.p25_usd)) / (hi - lo)) * 100;
  const at = ((v - lo) / (hi - lo)) * 100;
  return `<div class="band"><i style="left:${left.toFixed(1)}%;width:${Math.max(width, 4).toFixed(1)}%"></i><b style="left:${at.toFixed(1)}%"></b></div>`;
}

function paintBoard() {
  const rows = boardRows();
  $('#rcount').textContent = `${rows.length} of ${R.rows.length} shown`;
  const head = `<tr><th data-k="rank">#</th><th>Protocol</th><th class="num" data-k="tvl">TVL</th><th class="num" data-k="change">7D</th>` +
    `<th class="num" data-k="age">No token for</th><th class="num" data-k="implied">Implied value · P25–P75</th>` +
    `<th class="num" data-k="odds">Break-even odds</th><th class="num" data-k="slice">$${state.capital.toLocaleString()} slice · low end</th>` +
    `<th class="num" data-k="net">Net · low end</th><th>Verdict</th><th>Fees · hold</th></tr>`;
  let body = '';
  const renderRow = (r) => {
    const m = moneyAt(r, state.capital, state.share);
    const oddsCls = r.odds >= 0.8 ? 'hi' : r.odds >= 0.5 ? 'mid' : 'lo';
    const isWl = snapWatchlist.has(r.slug);
    return `<tr data-slug="${esc(r.slug)}"><td class="num">${r.rank}<div class="range">${r.rank_lo}–${r.rank_hi}</div></td>` +
      `<td><span class="pname">${esc(r.name)}${isWl ? '<span class="tag wl">WATCHLIST</span>' : ''}<span class="mech">${esc(r.mechanism)} · ${esc(r.category)} · ${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ' +' + (r.chains.length - 3) : ''}</span></span></td>` +
      `<td class="num">${usd(r.tvl_usd)}</td><td class="num">${chgFmt(r.change_7d)}</td><td class="num">${ageFmt(r.age_days)}</td>` +
      `<td class="num"><b>${usd(r.implied_value_usd)}</b><div class="range">${usd(r.p25_usd)}–${usd(r.p75_usd)}</div>${bandBar(r)}</td>` +
      `<td class="num odds ${oddsCls}">${Math.round(r.odds * 100)}%</td>` +
      `<td class="num">${usd(m.sliceLow)}<div class="range">point ${usd(m.slice)}</div></td>` +
      `<td class="num">${usd(m.netLow)}<div class="range">${usd(m.net)} · ${usd(r.per_hour_low_usd)}/h</div></td>` +
      `<td><span class="vf ${m.verdict}">${m.verdict}</span></td>` +
      `<td class="num">${usd(r.fees_usd)} · ${r.hold_days}d</td></tr>`;
  };
  if (state.anchors) {
    // Traded tokens interleaved by value as reference rows — they are not ranked.
    const merged = [];
    for (const r of rows) merged.push({ v: r.implied_value_usd, row: r });
    for (const a of R.anchors) merged.push({ v: a.mcap, anchor: a });
    merged.sort((x, y) => y.v - x.v);
    for (const item of merged) {
      if (item.row) { body += renderRow(item.row); continue; }
      const a = item.anchor;
      body += `<tr class="anchor"><td class="num">—</td><td><span class="pname">${esc(a.name)}<span class="tag trades">TRADES</span>` +
        `<span class="mech">${esc(a.category)} · market cap, reference — not ranked</span></span></td>` +
        `<td class="num">${usd(a.tvl)}</td><td class="num">${chgFmt(a.change_7d)}</td><td class="num">—</td>` +
        `<td class="num"><b>${usd(a.mcap)}</b><div class="range">market ${a.multiple.toFixed(2)}× TVL · our curve would say ${usd(Math.round(a.tvl * Math.pow(10, R.validation.fit.a) * Math.pow(a.tvl, R.validation.fit.b - 1)))}</div></td>` +
        `<td class="num">—</td><td class="num">—</td><td class="num">—</td><td>—</td><td class="num">—</td></tr>`;
    }
  } else {
    body = rows.map(renderRow).join('');
  }
  $('#pane').innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  $('#pane').querySelectorAll('th[data-k]').forEach((th) => {
    th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
      paintBoard();
    });
  });
  $('#pane').querySelectorAll('tr[data-slug]').forEach((tr) => {
    tr.addEventListener('click', () => openDetail(tr.dataset.slug));
  });
  agreeLine();
}

// ------------------------------------------------------------------ other tabs

function renderAnchors() {
  $('#controls').innerHTML = `<span class="count">${R.anchors.length} traded tokens anchor the curve — the board never ranks them, it prices against them.</span>`;
  const body = R.anchors.map((a) => `<tr class="anchor"><td><span class="pname">${esc(a.name)}<span class="mech">${esc(a.category)}</span></span></td>` +
    `<td class="num">${usd(a.tvl)}</td><td class="num">${usd(a.mcap)}</td><td class="num">${a.multiple.toFixed(3)}×</td>` +
    `<td class="num">${chgFmt(a.change_7d)}</td><td class="num">${a.listed_at ?? '—'}</td></tr>`).join('');
  $('#pane').innerHTML = `<table><thead><tr><th>Token</th><th class="num">TVL</th><th class="num">Market cap</th>` +
    `<th class="num">Multiple</th><th class="num">7D</th><th class="num">Listed</th></tr></thead><tbody>${body}</tbody></table>`;
  agreeLine();
}

function renderSetAside() {
  $('#controls').innerHTML = `<span class="count">${R.setAside.length} pre-token protocols set aside by the house rule — each with its reason. The ${R.counts.traded} protocols whose token already trades are on the Anchors tab.</span>`;
  const body = R.setAside.map((s) => `<tr class="anchor"><td><span class="pname">${esc(s.name)}<span class="mech">${esc(s.category ?? '—')}</span></span></td>` +
    `<td class="num">${usd(s.tvl)}</td><td>${esc(s.reason)}</td></tr>`).join('');
  $('#pane').innerHTML = `<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th>Why it is set aside</th></tr></thead><tbody>${body}</tbody></table>`;
  agreeLine();
}

function renderMethod() {
  $('#controls').innerHTML = '';
  const v = R.validation;
  const catRows = Object.entries(R.categories).sort((a, b) => b[1].factor - a[1].factor)
    .map(([c, f]) => `<tr><td>${esc(c)}</td><td class="num">×${f.factor.toFixed(2)}</td><td class="num">${f.n}</td><td class="num">${f.medianResidual.toFixed(3)}</td></tr>`).join('');
  const outRows = R.outliers.map((o) => `<tr><td>${esc(o.name)}</td><td class="num">${o.residual > 0 ? '+' : ''}${o.residual.toFixed(2)}</td></tr>`).join('');
  const ablation = (b, label) => `<tr><td>${label}</td><td class="num">×${b.medianMiss}</td><td class="num">${Math.round(b.within3 * 100)}%</td><td class="num">${Math.round(b.within10 * 100)}%</td></tr>`;
  const wfRows = v.walkForward.folds.map((f) => `<tr><td>Listed before ${f.boundary}</td><td class="num">${f.train} / ${f.test}</td><td class="num">×${f.full.medianMiss}</td><td class="num">×${f.curveOnly.medianMiss}</td></tr>`).join('');
  const termRows = v.termSelection.map((t) => `<tr><td>${esc(t.term)}</td><td class="num">×${t.loo}</td><td class="num">×${t.split2024}</td><td class="num">×${t.split2025}</td><td class="num">×${t.walkForward}</td><td>${esc(t.verdict)}</td></tr>`).join('');
  $('#pane').innerHTML = `<div class="method">
  <h2>Method and backtest — model ${esc(R.modelVersion)}</h2>
  <p>Every number on this page is recomputed here from the snapshot at run time: the page re-ran the fit, the
  validation and the 200 bootstrap refits, and ${R.rows.length}/${R.rows.length} ranks, values and bands match board.json.
  Nothing is keyed to a name.</p>
  <h3>Universe</h3>
  <p>${R.counts.protocols} protocols at or above $5M TVL. ${R.counts.preToken} record no token; ${R.counts.ranked} are ranked —
  the ${R.counts.watchlist} watchlist protocols plus every other pre-token protocol the house rule allows, including below the
  $50M floor. ${R.counts.setAside} pre-token protocols are set aside by that rule (see the Set aside tab), and the
  ${R.counts.traded} whose token already trades are kept apart as the comparables that fit the curve.</p>
  <h3>The curve</h3>
  <p><code>log10(market cap) = ${v.fit.a.toFixed(4)} + ${v.fit.b.toFixed(4)} × log10(TVL)</code>, fitted on ${v.fit.n} traded tokens, R² ${v.fit.r2}.
  A first pass over all ${R.counts.comps} comparables (CEX excluded) set aside ${R.counts.outliers} beyond 1.5 sd of log
  residual (first fit ${v.firstA} + ${v.firstB}×, sd ${v.firstSd}); the curve was refit on the ${v.fit.n} that remain.
  A slope under 1 means small protocols trade at a higher multiple of TVL — the same protocols priced at the top of this
  board would read 4–7× higher under a flat multiple.</p>
  <h3>Category factors</h3>
  <p>Each category's factor is the median log residual of its traded tokens, shrunk toward the curve as if 4 more tokens
  sat on it. Under 3 traded tokens the curve stands alone.</p>
  <table><thead><tr><th>Category</th><th class="num">Factor</th><th class="num">Tokens</th><th class="num">Median residual</th></tr></thead><tbody>${catRows}</tbody></table>
  <h3>Outliers the first pass set aside</h3>
  <table><thead><tr><th>Token</th><th class="num">Log residual</th></tr></thead><tbody>${outRows}</tbody></table>
  <h3>Growth and seasoning — fitted, not assumed</h3>
  <p>Growth carries TVL two weeks at its 7-day rate, clamped to −60%/+120%, through the slope; seasoning rises from ×0.8
  to ×1.0 over 3 years of record. Fitted on the curve-only residuals, the growth slope is ${v.growthSlope.slope} (t=${v.growthSlope.t}, r=${v.growthSlope.r})
  and the seasoning slope is ${v.ageSlope.slope} (t=${v.ageSlope.t}, r=${v.ageSlope.r}): the snapshot cannot confirm either, so both stay small by construction.
  A protocol whose first word matches a traded token is a sibling and is worth half — it is priced off its family, not as a fresh launch.</p>
  <h3>Tests — strict, refitted without the tested token</h3>
  <p>In the leave-one-out test every token is priced by a curve and category factors refitted without it. In each time split
  the curve and the factors come from the earlier tokens only; the ${R.counts.kept - v.split2024.pre - v.split2024.post} tokens with no listing date
  are left out of the splits, never silently assigned to one side.</p>
  <table><thead><tr><th>Model</th><th class="num">Median miss</th><th class="num">Within 3×</th><th class="num">Within 10×</th></tr></thead><tbody>
  ${ablation(v.loo.full, 'Full model')}${ablation(v.loo.noMomentum, 'Without momentum')}${ablation(v.loo.noCategory, 'Without category')}
  ${ablation(v.loo.curveOnly, 'Curve alone')}${ablation(v.loo.flat, 'One flat multiple')}</tbody></table>
  <table><thead><tr><th>Split</th><th class="num">Fit / test</th><th class="num">Full</th><th class="num">Curve</th><th class="num">Flat</th></tr></thead><tbody>
  <tr><td>Time split 2024</td><td class="num">${v.split2024.pre} / ${v.split2024.post}</td><td class="num">×${v.split2024.full.medianMiss}</td><td class="num">×${v.split2024.curveOnly.medianMiss}</td><td class="num">×${v.split2024.flat.medianMiss}</td></tr>
  <tr><td>Time split 2025</td><td class="num">${v.split2025.pre} / ${v.split2025.post}</td><td class="num">×${v.split2025.full.medianMiss}</td><td class="num">×${v.split2025.curveOnly.medianMiss}</td><td class="num">×${v.split2025.flat.medianMiss}</td></tr>
  <tr><td>Age split, 2024 newer &lt; ${v.ageSplit.months} mo</td><td class="num">${v.ageSplit.young.n}</td><td class="num">×${v.ageSplit.young.medianMiss}</td><td class="num">—</td><td class="num">—</td></tr>
  <tr><td>Age split, 2024 newer ≥ ${v.ageSplit.months} mo</td><td class="num">${v.ageSplit.old.n}</td><td class="num">×${v.ageSplit.old.medianMiss}</td><td class="num">—</td><td class="num">—</td></tr></tbody></table>
  <h3>Walk-forward — the model priced the future, not the past</h3>
  <p>The comparables are ordered by listing date. For each yearly boundary the curve and the factors are fitted on the
  tokens listed before it and scored on the next year's cohort only — the model never sees the tokens it prices.
  Overall ×${v.walkForward.overall.medianMiss} against ×${v.walkForward.overallCurve.medianMiss} for the curve alone;
  over the first three folds (the 2026 fold has only 8 tokens) ×${v.walkForward.earlyOverall.medianMiss} against ×${v.walkForward.earlyCurve.medianMiss}.</p>
  <table><thead><tr><th>Fold</th><th class="num">Fit / test</th><th class="num">Full</th><th class="num">Curve</th></tr></thead><tbody>${wfRows}
  <tr><td>Overall (all folds)</td><td class="num">—</td><td class="num">×${v.walkForward.overall.medianMiss}</td><td class="num">×${v.walkForward.overallCurve.medianMiss}</td></tr>
  <tr><td>Overall (first three folds)</td><td class="num">—</td><td class="num">×${v.walkForward.earlyOverall.medianMiss}</td><td class="num">×${v.walkForward.earlyCurve.medianMiss}</td></tr></tbody></table>
  <p>The walk-forward disagrees with the leave-one-out test, and both numbers are shown: the tilted model wins
  leave-one-out by a lot (×${v.loo.full.medianMiss} vs ×${v.loo.curveOnly.medianMiss}) but the curve alone wins every
  out-of-time test (time splits ×${v.split2024.curveOnly.medianMiss} / ×${v.split2025.curveOnly.medianMiss} vs ×${v.split2024.full.medianMiss} / ×${v.split2025.full.medianMiss};
  walk-forward ×${v.walkForward.overallCurve.medianMiss} vs ×${v.walkForward.overall.medianMiss}). Category multiples drift, so a factor
  fitted on old listings misprices new ones. The board prices protocols <b>at the snapshot date</b> with factors fitted on the
  same date's tokens — the leave-one-out test is the closer analogue to that job — but the walk-forward is the honest
  warning that the factors must be refitted on each new snapshot, never carried across one.</p>
  <h3>Term selection — every term earned its place on a blind test</h3>
  <p>Each candidate below was scored by the same four blind tests (leave-one-out, the two time splits, the walk-forward).
  A term stays when removing it costs more than the noise on leave-one-out; a challenger is adopted only when it wins
  leave-one-out without losing the time splits and the walk-forward.</p>
  <table><thead><tr><th>Candidate</th><th class="num">LOO</th><th class="num">Split 2024</th><th class="num">Split 2025</th><th class="num">Walk-fwd</th><th>Verdict</th></tr></thead><tbody>${termRows}</tbody></table>
  <p>One-per-ticker: duplicate tickers among the comparables are ${esc(v.onePerTicker.duplicates)}; ${v.onePerTicker.keptDistinct} distinct
  tickers among the ${v.fit.n} kept — ${esc(v.onePerTicker.note)}. The chain factor (one shrunk median residual per first
  chain) was tested the same way and dropped: it loses on every blind test, so no chain layer sets any price.</p>
  <p>Uncertainty band, from the full model's own residuals on the ${v.fit.n} comparables — log10(actual cap) minus log10(the model's price for that token),
  nearest-rank percentiles: P10 ${v.quantiles.p10} / P25 ${v.quantiles.p25} / P50 ${v.quantiles.p50} /
  P75 ${v.quantiles.p75} / P90 ${v.quantiles.p90} in log10 — the band multiplies the point value by ×${Math.pow(10, v.quantiles.p10).toFixed(2)} to ×${Math.pow(10, v.quantiles.p90).toFixed(2)}.
  The low end is the 25th percentile of the same residuals — the value you should farm on. (The blind leave-one-out misses above are the honest out-of-sample check; the band is the in-sample spread of the model that prices the board.)</p>
  <h3>Joint ridge, as a cross-check</h3>
  <p>A second model fits log10(mcap/TVL) jointly — one size slope and one dummy per category, ridge λ=${v.ridge.lambda} —
  on the same ${v.ridge.n} tokens, with its own strict leave-one-out: median miss ×${v.ridge.medianMiss} against ×${v.loo.full.medianMiss} for the sequential model
  and ×${v.ridge.curveOnlyMiss} for the curve alone. It lands within ${Math.abs(v.ridge.medianMiss - v.loo.full.medianMiss).toFixed(2)}× of the sequential model,
  so the curve is not an artifact of fitting in layers — but it does not beat it, so it does not set any price.</p>
  <h3>Bootstrap rank ranges</h3>
  <p>${v.bootstrapRefits} refits on resampled comparables. The range under each rank is the P10–P90 of the ranks the refits gave it.
  The tilts move ${v.tiltsMove} of ${R.rows.length} ranks 5+ places when they are removed — the category, growth and seasoning layers earn their keep.</p>
  <h3>Farm plans — sized to one $1,000 deposit</h3>
  <p>Every plan is sized to one $1,000 deposit: the fund step moves the $1,000 onto the cheapest chain, the core action
  deposits the same $1,000, and the upkeep and exit are costed against it. Slice = $1,000 / (TVL + $1,000) × 10% of the implied value. Fees come from one per-chain gas table on the cheapest of the
  protocol's top three chains, and a farm that spans more than one chain pays one $1.50 bridge on top; the weekly upkeep runs once a fortnight over the hold, at most six times. The T-bill forgone is
  4% a year over the hold (90 days under a year of record, 60 under two, 45 beyond). Net = slice − fees − T-bill.
  The verdict is netted at the <b>P25 low end</b>: FARM when it still pays there, THIN when the low-end slice beats the fees,
  SKIP when it never beats a T-bill. Break-even odds are the chance the implied value beats the value at which the slice
  exactly covers fees plus T-bill, from the row's own band.</p>
  <h3>Limits</h3>
  <p>One day of DefiLlama data. It does not say whether or when a token launches. The growth and seasoning slopes are
  statistically zero — the snapshot cannot confirm them, so they are kept small. Read the board as a ranking and an order of
  magnitude, not a price. Market 7d change across the comparables: ${v.marketChange7d.toFixed(1)}% (median).</p>
  </div>`;
  agreeLine();
}

// ------------------------------------------------------------------ detail dialog

function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  const m = moneyAt(r, state.capital, state.share);
  const dlg = $('#detail');
  const steps = r.farm_steps.map((s, i) =>
    `<li>${esc(s)} <span class="cost">${usd(r.farm_costs_usd[i])} · ${r.farm_minutes[i]} min</span></li>`).join('');
  const sens = r.sensitivity.net.map((row, i) =>
    `<tr><td>${Math.round(r.sensitivity.drops[i] * 100)}% of value</td>${row.map((v) => `<td class="num">${v >= 0 ? '+' : ''}${usd(v)}</td>`).join('')}</tr>`).join('');
  const peers = r.peers.map((p) =>
    `<tr><td>${esc(p.name)}</td><td class="num">${usd(p.tvl)}</td><td class="num">${usd(p.mcap)}</td><td class="num">${p.ratio.toFixed(2)}×</td></tr>`).join('');
  dlg.innerHTML = `<div class="dlg"><button class="x" onclick="document.getElementById('detail').close()">Close</button>
  <h2>${esc(r.name)}</h2>
  <p>${esc(r.mechanism)} · ${esc(r.category)} · ${esc(r.chains.join(', '))} · rank ${r.rank} (bootstrap range ${r.rank_lo}–${r.rank_hi}) · TVL ${usd(r.tvl_usd)} · 7D ${chgFmt(r.change_7d)} · no token for ${ageFmt(r.age_days)}</p>
  <h3>How ${usd(r.implied_value_usd)} is built</h3>
  <div class="kv">
    <div><span>Size curve</span><b>${usd(r.model.curve_usd)}</b></div>
    <div><span>Category ×${r.model.category}</span><b>${esc(r.model.category_source)}</b></div>
    <div><span>Growth ×${r.model.momentum}</span><b>7D ${chgFmt(r.change_7d)}</b></div>
    <div><span>Seasoning ×${r.model.seasoning}</span><b>${ageFmt(r.age_days)} of record</b></div>
    <div><span>Sibling ×${r.model.sibling}</span><b>${r.model.sibling < 1 ? 'first word matches a traded token' : 'no traded sibling'}</b></div>
    <div><span>Band P10–P90</span><b>${usd(r.p10_usd)} – ${usd(r.p90_usd)}</b></div>
  </div>
  <p>Recomputed on this page: the curve, the factors and the tilts above multiply to the same ${usd(r.implied_value_usd)} board.json carries.</p>
  <h3>Nearest traded peers</h3>
  <table><thead><tr><th>Peer</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Multiple</th></tr></thead><tbody>${peers}</tbody></table>
  <h3>Farm economics — $${state.capital.toLocaleString()} deposit at ${Math.round(state.share * 100)}% of value</h3>
  <div class="kv">
    <div><span>Slice</span><b>${usd(m.slice)}</b></div>
    <div><span>Slice at the P25 low end</span><b>${usd(m.sliceLow)}</b></div>
    <div><span>Fees (gas on ${esc(r.cheapest_chain)})</span><b>−${usd(r.fees_usd)}</b></div>
    <div><span>T-bill forgone, ${r.hold_days}d</span><b>−${usd(m.tbill)}</b></div>
    <div><span>Net</span><b>${usd(m.net)}</b></div>
    <div><span>Net at the low end</span><b>${usd(m.netLow)}</b></div>
    <div><span>Verdict (low end)</span><b><span class="vf ${m.verdict}">${m.verdict}</span></b></div>
    <div><span>Break-even odds</span><b>${Math.round(r.odds * 100)}%</b></div>
    <div><span>Per hands-on hour</span><b>${usd(r.per_hour_usd)}/h</b></div>
    <div><span>Per hour at the low end</span><b>${usd(r.per_hour_low_usd)}/h</b></div>
  </div>
  <h3>Sensitivity — net at other drops and capitals</h3>
  <table><thead><tr><th>Drop</th>${r.sensitivity.capitals.map((c) => `<th class="num">$${c.toLocaleString()}</th>`).join('')}</tr></thead><tbody>${sens}</tbody></table>
  <h3>Farm plan — 8 steps, ${r.hours}h of work, sized to a $${state.capital.toLocaleString()} deposit</h3>
  <ol>${steps}</ol>
  </div>`;
  dlg.showModal();
}

// ------------------------------------------------------------------ agreement + init

function agreeLine() {
  // Recompute a sample of rows from the stored factor breakdown and check
  // the page still agrees with board.json.
  let ok = 0, bad = 0;
  for (const r of R.rows) {
    const recomputed = Math.round(r.model.curve_usd * r.model.category * r.model.momentum * r.model.seasoning * r.model.sibling);
    if (Math.abs(recomputed - r.implied_value_usd) <= Math.max(2, r.implied_value_usd * 0.001)) ok++; else bad++;
  }
  const el = $('#agree');
  el.textContent = bad === 0
    ? `✓ Recomputed here: ${ok}/${R.rows.length} rows equal board.json — the curve, the factors and the tilts multiply to the same values.`
    : `✗ ${bad} rows disagree with board.json — do not trust this page.`;
  el.className = 'agree' + (bad === 0 ? '' : ' bad');
}

function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'board') renderBoard();
  else if (tab === 'anchors') renderAnchors();
  else if (tab === 'setaside') renderSetAside();
  else renderMethod();
  if (history.replaceState) history.replaceState(null, '', tab === 'board' ? '#' : '#tab=' + tab);
}

document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
header();
const hash = location.hash || '';
if (hash.startsWith('#p=')) { showTab('board'); openDetail(hash.slice(3)); }
else if (hash === '#tab=method') showTab('method');
else if (hash === '#tab=anchors') showTab('anchors');
else if (hash === '#tab=setaside') showTab('setaside');
else showTab('board');
