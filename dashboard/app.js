// Token Radar dashboard. Renders window.RADAR three ways: the ranked
// board, one protocol's detail, and the method behind the numbers.
// The agreement line at the top recomputes every implied value from the
// stored model factors and counts how many match board.json — it is the
// page's own check, not a claim.

const R = window.RADAR;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function money(x) {
  if (x === null || x === undefined) return "—";
  const abs = Math.abs(x);
  const dp = abs >= 1000 ? 0 : 2;
  return "$" + x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function money2(x) {
  return "$" + Number(x).toFixed(2);
}

function num(x) {
  return x === null || x === undefined ? "—" : Number(x).toLocaleString("en-US");
}

function chg(x) {
  if (x === null || x === undefined) return "—";
  return (x > 0 ? "+" : "") + x.toFixed(2) + "%";
}

function verdictClass(v) {
  return v === "FARM" ? "v-farm" : v === "THIN" ? "v-thin" : "v-skip";
}

// The recompute: implied = round(curve x category x momentum x seasoning
// x sibling), from the stored (rounded) factors. A row agrees when the
// recomputed value is within the same tolerance the gate uses.
function recompute() {
  let agree = 0;
  for (const r of R.rows) {
    const m = r.model;
    const again = Math.round(m.curve_usd * m.category * m.momentum * m.seasoning * m.sibling);
    const tol = Math.max(2, 0.001 * r.implied_value_usd);
    if (Math.abs(again - r.implied_value_usd) <= tol) agree++;
  }
  return { agree, total: R.rows.length };
}

function showAgreement() {
  const { agree, total } = recompute();
  document.getElementById("agree").textContent =
    `✓ Recomputed here: ${agree}/${total} rows equal board.json`;
}

function anchoredCategories() {
  const set = new Set();
  for (const [cat, info] of Object.entries(R.validation.categories)) {
    if (info.n >= 3) set.add(cat);
  }
  return set;
}

function boardRows() {
  const q = (document.getElementById("q").value || "").trim().toLowerCase();
  const wl = document.getElementById("fwl").checked;
  const worth = document.getElementById("fworth").checked;
  const rising = document.getElementById("frising").checked;
  const anchors = document.getElementById("fanchors").checked;
  const wlSet = new Set(R.watchlist);
  const anchored = anchoredCategories();
  return R.rows.filter((r) => {
    if (wl && !wlSet.has(r.slug)) return false;
    if (worth && r.verdict !== "FARM") return false;
    if (rising && !(r.change_7d !== null && r.change_7d > 0)) return false;
    if (anchors && !anchored.has(r.category)) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q) || r.category.toLowerCase().includes(q))) return false;
    return true;
  });
}

function renderBoard() {
  const rows = boardRows();
  const tb = document.querySelector("#pane tbody");
  tb.innerHTML = rows.map((r) => `<tr>
    <td>${r.rank}</td>
    <td><a href="#p=${esc(r.slug)}">${esc(r.name)}</a></td>
    <td>${esc(r.category)}</td>
    <td class="num">${money(r.tvl_usd)}</td>
    <td class="num">${money(r.implied_value_usd)}</td>
    <td class="num">${money(r.low_usd)}</td>
    <td class="num">${money2(r.slice_usd)}</td>
    <td class="num ${r.net_usd >= 0 ? "pos" : "neg"}">${money2(r.net_usd)}</td>
    <td class="num ${r.net_low_usd >= 0 ? "pos" : "neg"}">${money2(r.net_low_usd)}</td>
    <td class="num">${money2(r.per_hour_usd)}/h</td>
    <td class="num">${(r.odds * 100).toFixed(1)}%</td>
    <td><span class="badge ${verdictClass(r.verdict)}">${r.verdict}</span></td>
  </tr>`).join("");
  document.getElementById("rowcount").textContent =
    `${rows.length} of ${R.rows.length} rows · ${R.verdicts.farm} FARM / ${R.verdicts.thin} THIN / ${R.verdicts.skip} SKIP at the low end`;
}

function statRow(label, value) {
  return `<div class="stat"><span>${esc(label)}</span><strong>${value}</strong></div>`;
}

function renderDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  const el = document.getElementById("detail-view");
  if (!r) {
    el.innerHTML = `<h2>Not on the board</h2><p>No ranked protocol has the slug ${esc(slug)}.</p><p><a href="#">Back to the board</a></p>`;
    return;
  }
  const m = r.model;
  const onWatchlist = R.watchlist.includes(r.slug);
  const steps = r.farm_steps.map((s, i) => `<li>
    <div class="step-head"><span class="step-no">${i + 1}</span>
    <span class="step-cost">${money2(r.farm_costs_usd[i])} · ${r.farm_minutes[i]} min</span></div>
    <p>${esc(s)}</p></li>`).join("");
  const sens = r.sensitivity.net.map((row, i) => `<tr>
    <td>${(r.sensitivity.drops[i] * 100).toFixed(0)}% capture</td>
    ${row.map((v) => `<td class="num ${v >= 0 ? "pos" : "neg"}">${money2(v)}</td>`).join("")}
  </tr>`).join("");
  const peers = r.peers.map((p) => `<tr>
    <td>${esc(p.name)}</td><td class="num">${money(p.tvl)}</td>
    <td class="num">${money(p.mcap)}</td><td class="num">${p.ratio.toFixed(4)}×</td>
  </tr>`).join("");
  el.innerHTML = `
    <p><a href="#">← Board</a></p>
    <h2>${esc(r.name)} <span class="badge ${verdictClass(r.verdict)}">${r.verdict}</span></h2>
    <p class="sub">${esc(r.category)} · ${esc(r.mechanism)} · rank ${r.rank} (bootstrap ${r.rank_lo}–${r.rank_hi})</p>
    <div class="stats">
      ${statRow("TVL", money(r.tvl_usd))}
      ${statRow("7d change", chg(r.change_7d))}
      ${statRow("Age", r.age_days === null ? "unknown" : r.age_days + " days")}
      ${statRow("Listed", r.listed_at ?? "—")}
      ${statRow("Implied value", money(r.implied_value_usd))}
      ${statRow("Band P10–P90", money(r.p10_usd) + " – " + money(r.p90_usd))}
      ${statRow("Low end (P25)", money(r.low_usd))}
      ${statRow("Slice on $1,000", money2(r.slice_usd) + " (low " + money2(r.slice_low_usd) + ")")}
      ${statRow("Fees", money2(r.fees_usd) + " (gas " + money2(r.gas_usd) + " on " + esc(r.cheapest_chain) + ")")}
      ${statRow("T-bill forgone", money2(r.tbill_usd) + " over " + r.hold_days + " days")}
      ${statRow("Net", money2(r.net_usd) + " (low " + money2(r.net_low_usd) + ")")}
      ${statRow("Per hour", money2(r.per_hour_usd) + "/h (low " + money2(r.per_hour_low_usd) + "/h)")}
      ${statRow("Odds of breaking even", (r.odds * 100).toFixed(1) + "%")}
      ${statRow("Hours of work", r.hours + " h")}
      ${statRow("Watchlist", onWatchlist ? "yes — one of the 40 watched" : "no")}
    </div>
    <h3>How the price is built</h3>
    <div class="stats">
      ${statRow("Curve value", money(r.model.curve_usd))}
      ${statRow("Category factor", m.category.toFixed(4) + " (" + m.category_n + " traded — " + esc(m.category_source) + ")")}
      ${statRow("Momentum", m.momentum.toFixed(4))}
      ${statRow("Seasoning", m.seasoning.toFixed(4))}
      ${statRow("Sibling", m.sibling === 0.5 ? "0.5 — shares a name with a traded token" : "1")}
    </div>
    <h3>Farm plan — one $1,000 deposit</h3>
    <ol class="steps">${steps}</ol>
    <h3>What if the slice is smaller, or the deposit is bigger</h3>
    <table class="mini"><thead><tr><th></th>
      ${r.sensitivity.capitals.map((c) => `<th class="num">$${num(c)}</th>`).join("")}
    </tr></thead><tbody>${sens}</tbody></table>
    <h3>Nearest tokens that already trade</h3>
    <table class="mini"><thead><tr><th>Token</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead>
    <tbody>${peers}</tbody></table>`;
}

function blindTable(title, rows) {
  const body = rows.map((x) => `<tr><td>${esc(x[0])}</td>
    <td class="num">${x[1]}</td><td class="num">${x[2]}</td><td class="num">${x[3]}</td></tr>`).join("");
  return `<h3>${esc(title)}</h3>
    <table class="mini"><thead><tr><th>Test</th><th class="num">Median miss</th>
    <th class="num">Within 3×</th><th class="num">Within 10×</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

function renderMethod() {
  const v = R.validation;
  const wf = v.walkForward.folds.map((f) => `<tr>
    <td>${esc(f.boundary)}</td><td class="num">${f.train}</td><td class="num">${f.test}</td>
    <td class="num">${f.full.medianMiss}×</td><td class="num">${f.curveOnly.medianMiss}×</td>
  </tr>`).join("");
  const terms = v.termSelection.map((t) => `<tr>
    <td>${esc(t.term)}</td><td class="num">${t.loo}×</td><td class="num">${t.split2024}×</td>
    <td class="num">${t.split2025}×</td><td class="num">${t.walkForward}×</td><td>${esc(t.verdict)}</td>
  </tr>`).join("");
  const outliers = v.outliers.map((o) => `${esc(o.name)} (${o.residual > 0 ? "+" : ""}${o.residual})`).join(", ");
  document.getElementById("method-view").innerHTML = `
    <p><a href="#">← Board</a></p>
    <h2>Method — radar-6</h2>
    <p>Each pre-token protocol is priced from the ${v.fit.n} tokens that already trade.
    The curve is log<sub>10</sub>(mcap) = ${v.fit.a.toFixed(4)} + ${v.fit.b.toFixed(4)} · log<sub>10</sub>(TVL),
    R² ${v.fit.r2}, fitted after dropping ${v.outliers.length} outliers beyond 1.5 standard deviations
    (${esc(outliers)}). Four tilts sit on top of the curve: a shrunken category factor,
    a momentum tilt from the 7-day TVL change, a seasoning tilt from listing age, and a
    0.5× sibling cut when the name is shared with a traded token.</p>
    <p><strong>The honest tension:</strong> the tilts win leave-one-out (${v.loo.full.medianMiss}× vs
    ${v.loo.curveOnly.medianMiss}× for the curve alone) but the curve wins every out-of-time test
    (2024 split ${v.split2024.curveOnly.medianMiss}× vs ${v.split2024.full.medianMiss}×;
    2025 split ${v.split2025.curveOnly.medianMiss}× vs ${v.split2025.full.medianMiss}×;
    walk-forward ${v.walkForward.overallCurve.medianMiss}× vs ${v.walkForward.overall.medianMiss}×).
    The tilts are kept because they win the only test that uses all the data, but the factors
    must be refitted on each new snapshot — a factor fitted on this snapshot is not a fact
    about the next one.</p>
    ${blindTable("Leave-one-out (103 tokens)", [
      ["Full model", v.loo.full.medianMiss + "×", v.loo.full.within3, v.loo.full.within10],
      ["No momentum", v.loo.noMomentum.medianMiss + "×", v.loo.noMomentum.within3, v.loo.noMomentum.within10],
      ["No category", v.loo.noCategory.medianMiss + "×", v.loo.noCategory.within3, v.loo.noCategory.within10],
      ["Curve alone", v.loo.curveOnly.medianMiss + "×", v.loo.curveOnly.within3, v.loo.curveOnly.within10],
      ["Flat median multiple", v.loo.flat.medianMiss + "×", v.loo.flat.within3, v.loo.flat.within10],
    ])}
    ${blindTable("Time splits", [
      ["2024 split, full (" + v.split2024.pre + " train / " + v.split2024.post + " test)", v.split2024.full.medianMiss + "×", v.split2024.full.within3, v.split2024.full.within10],
      ["2024 split, curve", v.split2024.curveOnly.medianMiss + "×", v.split2024.curveOnly.within3, v.split2024.curveOnly.within10],
      ["2025 split, full (" + v.split2025.pre + " train / " + v.split2025.post + " test)", v.split2025.full.medianMiss + "×", v.split2025.full.within3, v.split2025.full.within10],
      ["2025 split, curve", v.split2025.curveOnly.medianMiss + "×", v.split2025.curveOnly.within3, v.split2025.curveOnly.within10],
    ])}
    <h3>Walk-forward</h3>
    <table class="mini"><thead><tr><th>Train before</th><th class="num">Train</th><th class="num">Test</th>
    <th class="num">Full</th><th class="num">Curve</th></tr></thead><tbody>${wf}</tbody></table>
    <p>Overall ${v.walkForward.overall.n} tests: full ${v.walkForward.overall.medianMiss}×,
    curve ${v.walkForward.overallCurve.medianMiss}×. Without the thin 2026 fold
    (${v.walkForward.earlyOverall.n} tests): full ${v.walkForward.earlyOverall.medianMiss}×,
    curve ${v.walkForward.earlyCurve.medianMiss}×. The 2026 fold is small (8 tests) and
    the worst of the four — a reminder that a single year can break the pattern.</p>
    <h3>Term selection — fourteen ways the model could have been built</h3>
    <table class="mini"><thead><tr><th>Candidate</th><th class="num">LOO</th><th class="num">2024</th>
    <th class="num">2025</th><th class="num">Walk-fwd</th><th>Verdict</th></tr></thead>
    <tbody>${terms}</tbody></table>
    <h3>What the tilts are worth</h3>
    <p>Ranking by the full model instead of the curve alone moves ${v.tiltsMove} of ${R.rows.length}
    rows by five places or more. The market's median 7-day change across the ${R.counts.comps} traded
    tokens is ${v.marketChange7d}%. Growth and age barely explain the curve's residuals
    (growth slope ${v.growthSlope.slope}, t = ${v.growthSlope.t}; age slope ${v.ageSlope.slope},
    t = ${v.ageSlope.t}) — which is why the tilts are small by design. A ridge on the two
    weak signals (λ = ${v.ridge.lambda}) lands at ${v.ridge.medianMiss}×, no better than the
    curve, so it is reported and not used.</p>
    <h3>Farm economics</h3>
    <p>Every plan is one $1,000 deposit. The slice is the deposit's share of TVL times 10% of the
    implied value; gas is the cheapest of the protocol's first three chains, plus one $1.50 bridge
    when the farm spans chains; the T-bill forgone is 4% a year over the hold (45–90 days by age).
    A row is FARM when it still pays at the low end of the band, THIN when the low slice covers
    the fees, SKIP otherwise. ${R.verdicts.farm} of ${R.rows.length} rows pay at the low end;
    ${R.pointVerdicts.farm} pay at the point value.</p>`;
}

function route() {
  const hash = location.hash || "";
  const board = document.getElementById("board-view");
  const detail = document.getElementById("detail-view");
  const method = document.getElementById("method-view");
  board.hidden = true;
  detail.hidden = true;
  method.hidden = true;
  if (hash.startsWith("#p=")) {
    renderDetail(decodeURIComponent(hash.slice(3)));
    detail.hidden = false;
  } else if (hash === "#tab=method") {
    renderMethod();
    method.hidden = false;
  } else {
    renderBoard();
    board.hidden = false;
  }
  showAgreement();
}

document.getElementById("headline").textContent = R.headline;
document.getElementById("q").addEventListener("input", renderBoard);
for (const id of ["fwl", "fworth", "frising", "fanchors"]) {
  document.getElementById(id).addEventListener("change", renderBoard);
}
window.addEventListener("hashchange", route);
route();
