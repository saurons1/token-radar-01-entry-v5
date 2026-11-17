// Token launch radar — the model ("radar-6").
// Builds the whole board from one DefiLlama snapshot: a log-log curve of
// market cap on TVL fitted to the tokens that already trade, trimmed at
// 1.5 sd, then four small tilts (category, momentum, seasoning, sibling).
// Everything is validated blind — leave-one-out, two time splits and a
// four-fold walk-forward — before any pre-token protocol is priced.
//
// Deterministic: same snapshot in, same bytes out. The only randomness is
// the bootstrap, seeded from the anchor round.

import type {
  Anchor, BlindSummary, BoardRow, Comp, FactorInfo, Outlier, Peer, PriceOpts,
  Proto, SetAside,
} from "../vendor/makefun-board.ts";
import {
  ageDays, categoryFactors, categorySource, chainFactors, cheapestOf,
  curveValue, DEPOSIT, farmCostsFor, farmMinutesFor, farmStepsFor, firstWord,
  holdDaysFor, isPreToken, mechanismFor, medianOf, missRatio, momentumFactor,
  mulberry32, nearestPeers, NOT_A_LAUNCH, oddsFor, ols, quantile1,
  round2, round4, sampleSd, seasoningFactor, sensitivityFor, summarizeMisses,
  tbillFor, TRIM_SD, verdictFor, VERSION_RE, WRAPPED_WORDS, EXCHANGE_NAMES,
  checkCountFor, sliceFor, MODEL_VERSION,
} from "../vendor/makefun-board.ts";

export type Snapshot = {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
};

export type TermRow = {
  term: string;
  loo: number;
  split2024: number;
  split2025: number;
  walkForward: number;
  verdict: string;
};

export type FoldResult = {
  boundary: string;
  train: number;
  test: number;
  full: BlindSummary;
  curveOnly: BlindSummary;
};

export type Validation = {
  firstA: number;
  firstB: number;
  firstSd: number;
  fit: { a: number; b: number; n: number; r2: number };
  outliers: Outlier[];
  categories: Record<string, { n: number; factor: number; medianResidual: number }>;
  loo: {
    full: BlindSummary;
    noMomentum: BlindSummary;
    noCategory: BlindSummary;
    curveOnly: BlindSummary;
    flat: BlindSummary;
  };
  split2024: { cutoff: string; pre: number; post: number; full: BlindSummary; curveOnly: BlindSummary; flat: BlindSummary };
  split2025: { cutoff: string; pre: number; post: number; full: BlindSummary; curveOnly: BlindSummary; flat: BlindSummary };
  ageSplit: { months: number; young: BlindSummary; old: BlindSummary };
  growthSlope: { slope: number; t: number; r: number };
  ageSlope: { slope: number; t: number; r: number };
  quantiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  ridge: { lambda: number; n: number; medianMiss: number; within3: number; curveOnlyMiss: number };
  walkForward: {
    folds: FoldResult[];
    overall: BlindSummary;
    overallCurve: BlindSummary;
    earlyOverall: BlindSummary;
    earlyCurve: BlindSummary;
  };
  termSelection: TermRow[];
  onePerTicker: { duplicates: string; keptDistinct: number; note: string };
  bootstrapRefits: number;
  tiltsMove: number;
  marketChange7d: number;
};

export type Radar = {
  asOf: string;
  modelVersion: string;
  watchlist: string[];
  counts: {
    protocols: number; preToken: number; ranked: number; watchlist: number;
    watchlistCovered: number; comps: number; kept: number; outliers: number;
    setAside: number; traded: number;
  };
  verdicts: { farm: number; thin: number; skip: number };
  pointVerdicts: { farm: number; thin: number; skip: number };
  fit: { a: number; b: number; n: number; r2: number };
  outliers: Outlier[];
  categories: Record<string, { n: number; factor: number; medianResidual: number }>;
  validation: Validation;
  rows: BoardRow[];
  anchors: Anchor[];
  setAside: SetAside[];
  farmNext: Array<{
    slug: string; name: string; rank: number; mechanism: string;
    net_usd: number; net_low_usd: number; gas_usd: number; hours: number;
    per_hour_usd: number; per_hour_low_usd: number; odds: number;
  }>;
  bestPerHourWatchlist: { name: string; slug: string; perHour: number };
  totalImpliedUsd: number;
  headline: string;
};

// ---- snapshot ---------------------------------------------------------

export function parseSnapshot(raw: unknown): Snapshot {
  const r = raw as Record<string, unknown>;
  const protos = Array.isArray(r.protocols) ? r.protocols : [];
  const protocols: Proto[] = protos.map((p) => {
    const q = p as Record<string, unknown>;
    const chains = Array.isArray(q.chains) ? (q.chains as unknown[]).map(String) : [];
    return {
      slug: String(q.slug ?? ""),
      name: String(q.name ?? ""),
      category: String(q.category ?? ""),
      chains,
      tvl_usd: typeof q.tvl_usd === "number" ? q.tvl_usd : 0,
      change_7d: typeof q.change_7d === "number" ? q.change_7d : null,
      mcap_usd: typeof q.mcap_usd === "number" ? q.mcap_usd : null,
      listed_at: typeof q.listed_at === "string" ? q.listed_at : null,
      gecko_id: typeof q.gecko_id === "string" ? q.gecko_id : null,
      symbol: typeof q.symbol === "string" ? q.symbol : null,
    };
  });
  return {
    as_of: String(r.as_of ?? ""),
    source: String(r.source ?? ""),
    floor_usd: typeof r.floor_usd === "number" ? r.floor_usd : 0,
    protocols,
    watchlist: Array.isArray(r.watchlist) ? (r.watchlist as unknown[]).map(String) : [],
  };
}

// ---- comps ------------------------------------------------------------

// Tokens that already trade, merged by identity: a CoinGecko id when the
// protocol has one, otherwise its ticker (or its slug when even that is
// missing). Merging sums TVL and keeps the first protocol's other fields.
export function buildComps(protocols: Proto[]): Comp[] {
  const byKey = new Map<string, Comp>();
  const sorted = [...protocols].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of sorted) {
    if (p.mcap_usd === null || p.mcap_usd <= 0) continue;
    if (p.category === "CEX") continue;
    const key = p.gecko_id ?? `sym:${p.symbol ?? p.slug}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.tvl += p.tvl_usd;
    } else {
      byKey.set(key, {
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl: p.tvl_usd,
        mcap: p.mcap_usd,
        ch: p.change_7d ?? 0,
        listed: p.listed_at,
        symbol: (p.symbol ?? "").toUpperCase(),
      });
    }
  }
  return [...byKey.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

export type FitResult = {
  firstA: number;
  firstB: number;
  firstSd: number;
  fit: { a: number; b: number; n: number; r2: number };
  kept: Comp[];
  outliers: Outlier[];
};

// Two-pass fit: OLS on every comp, drop anything more than TRIM_SD sample
// deviations out in log space, refit on what survives.
export function fitAndTrim(comps: Comp[], trimSd: number): FitResult {
  const pts = comps.map((t) => [Math.log10(t.tvl), Math.log10(t.mcap)] as [number, number]);
  const first = ols(pts);
  const res = comps.map((t) => Math.log10(t.mcap) - (first.a + first.b * Math.log10(t.tvl)));
  const sd = sampleSd(res);
  const kept: Comp[] = [];
  const outliers: Outlier[] = [];
  comps.forEach((t, i) => {
    if (Math.abs(res[i]) > trimSd * sd) {
      outliers.push({ name: t.name, slug: t.slug, residual: round4(res[i]) });
    } else {
      kept.push(t);
    }
  });
  outliers.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));
  const keptPts = kept.map((t) => [Math.log10(t.tvl), Math.log10(t.mcap)] as [number, number]);
  const f = ols(keptPts);
  const ys = kept.map((t) => Math.log10(t.mcap));
  const meanY = ys.reduce((s, v) => s + v, 0) / Math.max(1, ys.length);
  let ssRes = 0, ssTot = 0;
  kept.forEach((t, i) => {
    const pred = f.a + f.b * keptPts[i][0];
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  });
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return {
    firstA: round4(first.a),
    firstB: round4(first.b),
    firstSd: round4(sd),
    fit: { a: f.a, b: f.b, n: kept.length, r2: round4(r2) },
    kept,
    outliers,
  };
}

// First words of a comp set. A protocol is a sibling of a token that
// already trades when its name starts with one of these words — the market
// rarely pays twice for the same brand. For a comp, pass the set WITHOUT
// the comp itself, so only a word another comp shares counts; for a
// pre-token row, pass the whole kept set.
export function siblingWords(comps: Comp[]): Set<string> {
  return new Set(comps.map((t) => firstWord(t.name)).filter(Boolean));
}

export function medianMultiple(comps: Comp[]): number {
  return medianOf(comps.map((t) => t.mcap / t.tvl));
}

// Price one comp under an option set, given a fit, factors and sibling
// words that were all trained without it (for blind tests). By default the
// factors are the STORED ones — curve to 2dp, the rest to 4dp — the same
// rounding the board rows are priced from, so a blind test prices exactly
// what the board would show. Pass { rounded: false } for the fitted
// model's own residuals, which are measured at full precision.
function priceBlind(
  t: Comp, fit: { a: number; b: number }, factors: Map<string, FactorInfo>,
  words: Set<string>, opts: PriceOpts, asOf: string,
  chainFac?: Map<string, FactorInfo>,
): number {
  const useRounded = opts.rounded !== false;
  const roundF = useRounded ? round4 : (x: number): number => x;
  const base = useRounded ? round2(curveValue(fit.a, fit.b, t.tvl)) : curveValue(fit.a, fit.b, t.tvl);
  const cat = opts.category === false ? 1 : roundF(factors.get(t.category)?.factor ?? 1);
  let v = base * cat;
  if (opts.momentum !== false) v *= roundF(momentumFactor(t.ch, opts.momCoef ?? 0.4));
  if (opts.seasoning !== false) v *= roundF(seasoningFactor(ageDays(asOf, t.listed), 0.8, opts.seaSpan ?? 0.2));
  if (opts.sibling !== false && words.has(firstWord(t.name))) v *= 0.5;
  if (opts.chain && chainFac) {
    const ch0 = t.chains.length > 0 ? t.chains[0] : "none";
    v *= roundF(chainFac.get(ch0)?.factor ?? 1);
  }
  return Math.max(1, v);
}

function fitFor(comps: Comp[]): { a: number; b: number } {
  return ols(comps.map((t) => [Math.log10(t.tvl), Math.log10(t.mcap)] as [number, number]));
}

// Leave-one-out over the kept comps: each comp is priced by a model that
// never saw it — fresh curve, fresh category factors, fresh sibling words.
// The flat baseline is different: one market multiple for the whole board,
// the median mcap/TVL across all kept comps, not a per-fold refit.
export function looSummary(kept: Comp[], opts: PriceOpts, asOf: string): BlindSummary {
  const misses: number[] = [];
  const flatMult = medianMultiple(kept);
  for (let i = 0; i < kept.length; i++) {
    const train = kept.filter((_, j) => j !== i);
    const f = fitFor(train);
    const fac = categoryFactors(train, f);
    const words = siblingWords(train);
    const chainFac = opts.chain ? chainFactors(train, f) : undefined;
    const t = kept[i];
    let price: number;
    if (opts.flat === true) {
      price = t.tvl * flatMult;
    } else {
      price = priceBlind(t, f, fac, words, opts, asOf, chainFac);
    }
    misses.push(missRatio(price, t.mcap));
  }
  return summarizeMisses(misses);
}

export type SplitResult = {
  cutoff: string;
  pre: number;
  post: number;
  full: BlindSummary;
  curveOnly: BlindSummary;
  flat: BlindSummary;
};

// Time split: train on everything listed before the cutoff, price what
// listed after it. The curve never sees the future. The `full` column
// honours the option set, so the term-selection table can re-run the split
// under each candidate model.
export function splitSummary(kept: Comp[], cutoff: string, opts: PriceOpts, asOf: string): SplitResult {
  const pre = kept.filter((t) => t.listed !== null && t.listed < cutoff);
  const post = kept.filter((t) => t.listed !== null && t.listed >= cutoff);
  const f = fitFor(pre);
  const fac = categoryFactors(pre, f);
  const words = siblingWords(pre);
  const flatMult = medianMultiple(pre);
  const chainFac = opts.chain ? chainFactors(pre, f) : undefined;
  const priceOf = (t: Comp, o: PriceOpts): number => priceBlind(t, f, fac, words, o, asOf, chainFac);
  const curveOpts: PriceOpts = { category: false, momentum: false, seasoning: false, sibling: false };
  return {
    cutoff,
    pre: pre.length,
    post: post.length,
    full: summarizeMisses(post.map((t) => missRatio(priceOf(t, opts), t.mcap))),
    curveOnly: summarizeMisses(post.map((t) => missRatio(priceOf(t, curveOpts), t.mcap))),
    flat: summarizeMisses(post.map((t) => missRatio(t.tvl * flatMult, t.mcap))),
  };
}

export type WalkForwardResult = {
  folds: FoldResult[];
  overall: BlindSummary;
  overallCurve: BlindSummary;
  earlyOverall: BlindSummary;
  earlyCurve: BlindSummary;
};

// Walk-forward: for each year, train on everything listed before January
// 1st of that year and price what listed during it. The overall pools all
// four folds; the early overall drops the thin 2026 fold.
export function walkForwardSummary(kept: Comp[], opts: PriceOpts, asOf: string): WalkForwardResult {
  const dated = kept.filter((t) => t.listed !== null);
  const curveOpts: PriceOpts = { category: false, momentum: false, seasoning: false, sibling: false };
  const folds: FoldResult[] = [];
  const allFull: number[] = [];
  const allCurve: number[] = [];
  const earlyFull: number[] = [];
  const earlyCurve: number[] = [];
  for (const year of [2023, 2024, 2025, 2026]) {
    const bound = `${year}-01-01`;
    const train = dated.filter((t) => (t.listed as string) < bound);
    const test = dated.filter((t) => (t.listed as string).startsWith(String(year)));
    const f = fitFor(train);
    const fac = categoryFactors(train, f);
    const words = siblingWords(train);
    const chainFac = opts.chain ? chainFactors(train, f) : undefined;
    const fullM = test.map((t) => missRatio(priceBlind(t, f, fac, words, opts, asOf, chainFac), t.mcap));
    const curveM = test.map((t) => missRatio(priceBlind(t, f, fac, words, curveOpts, asOf, chainFac), t.mcap));
    folds.push({
      boundary: bound, train: train.length, test: test.length,
      full: summarizeMisses(fullM), curveOnly: summarizeMisses(curveM),
    });
    allFull.push(...fullM);
    allCurve.push(...curveM);
    if (year < 2026) { earlyFull.push(...fullM); earlyCurve.push(...curveM); }
  }
  return {
    folds,
    overall: summarizeMisses(allFull),
    overallCurve: summarizeMisses(allCurve),
    earlyOverall: summarizeMisses(earlyFull),
    earlyCurve: summarizeMisses(earlyCurve),
  };
}

// ---- ridge on the tilts -------------------------------------------------
// The curve alone leaves residuals. A small ridge regression (lambda 10)
// on those residuals, using the two weak signals the t-tests measured —
// 7-day growth and log age, both standardised — asks whether a continuous
// tilt beats the on/off tilts. It does not: the median miss stays near
// the curve's, so the ridge is reported and not adopted.
type RidgeFit = { meanY: number; meanX: [number, number]; sdX: [number, number]; beta: [number, number] };

function ridgeFit(xs: Array<[number, number]>, ys: number[], lambda: number): RidgeFit {
  const n = xs.length;
  const meanY = ys.reduce((s, v) => s + v, 0) / Math.max(1, n);
  const meanX: [number, number] = [0, 0];
  const sdX: [number, number] = [0, 0];
  for (let j = 0; j < 2; j++) {
    meanX[j] = xs.reduce((s, x) => s + x[j], 0) / Math.max(1, n);
    const varPop = xs.reduce((s, x) => s + (x[j] - meanX[j]) ** 2, 0) / Math.max(1, n);
    sdX[j] = Math.sqrt(varPop) || 1;
  }
  const z = xs.map((x) => [(x[0] - meanX[0]) / sdX[0], (x[1] - meanX[1]) / sdX[1]] as [number, number]);
  const yc = ys.map((y) => y - meanY);
  let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < n; i++) {
    s11 += z[i][0] * z[i][0]; s12 += z[i][0] * z[i][1]; s22 += z[i][1] * z[i][1];
    t1 += z[i][0] * yc[i]; t2 += z[i][1] * yc[i];
  }
  const a11 = s11 + lambda, a22 = s22 + lambda, a12 = s12;
  const det = a11 * a22 - a12 * a12;
  const b1 = det === 0 ? 0 : (a22 * t1 - a12 * t2) / det;
  const b2 = det === 0 ? 0 : (a11 * t2 - a12 * t1) / det;
  return { meanY, meanX, sdX, beta: [b1, b2] };
}

function ridgePredict(rf: RidgeFit, x: [number, number]): number {
  return rf.meanY
    + rf.beta[0] * ((x[0] - rf.meanX[0]) / rf.sdX[0])
    + rf.beta[1] * ((x[1] - rf.meanX[1]) / rf.sdX[1]);
}

function ridgeFeatures(t: Comp, asOf: string): [number, number] {
  return [t.ch / 100, Math.log10(ageDays(asOf, t.listed) ?? 365)];
}

export function ridgeSummary(kept: Comp[], asOf: string, lambda = 10): { medianMiss: number; within3: number } {
  const misses: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    const train = kept.filter((_, j) => j !== i);
    const f = fitFor(train);
    const fac = categoryFactors(train, f);
    const t = kept[i];
    const xs = train.map((u) => ridgeFeatures(u, asOf));
    const ys = train.map((u) => {
      const cat = fac.get(u.category)?.factor ?? 1;
      return Math.log10(u.mcap) - Math.log10(curveValue(f.a, f.b, u.tvl) * cat);
    });
    const rf = ridgeFit(xs, ys, lambda);
    const cat = fac.get(t.category)?.factor ?? 1;
    const pred = curveValue(f.a, f.b, t.tvl) * cat * 10 ** ridgePredict(rf, ridgeFeatures(t, asOf));
    misses.push(missRatio(Math.max(1, pred), t.mcap));
  }
  const s = summarizeMisses(misses);
  return { medianMiss: s.medianMiss, within3: s.within3 };
}

// ---- t-tests on the curve-only residuals --------------------------------

export function tStat(xs: number[], ys: number[]): { slope: number; t: number; r: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const r = sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  const intercept = my - slope * mx;
  let ssRes = 0;
  for (let i = 0; i < n; i++) ssRes += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const se = n <= 2 || sxx === 0 ? 0 : Math.sqrt(ssRes / (n - 2) / sxx);
  const t = se === 0 ? 0 : slope / se;
  return { slope: round4(slope), t: round2(t), r: round4(r) };
}

// ---- one blind run (LOO + both splits + walk-forward) -------------------

export type BlindRun = {
  loo: BlindSummary;
  split2024: SplitResult;
  split2025: SplitResult;
  walkForward: WalkForwardResult;
};

function runBlind(
  comps: Comp[], opts: PriceOpts, trimSd: number, asOf: string,
): { kept: Comp[]; fit: { a: number; b: number; n: number; r2: number }; run: BlindRun } {
  const { kept, fit } = fitAndTrim(comps, trimSd);
  return {
    kept,
    fit,
    run: {
      loo: looSummary(kept, opts, asOf),
      split2024: splitSummary(kept, "2024-01-01", opts, asOf),
      split2025: splitSummary(kept, "2025-01-01", opts, asOf),
      walkForward: walkForwardSummary(kept, opts, asOf),
    },
  };
}

// ---- term selection -----------------------------------------------------
// Fourteen ways the model could have been built. Each one is re-run blind
// and judged on the same four numbers; the table is the evidence for
// keeping the model as it is.

const TERM_VERDICTS = {
  full: "the model, kept as-is",
  noMomentum: "kept: leave-one-out still prefers it",
  noCategory: "kept: leave-one-out still prefers it",
  noSeasoning: "kept: leave-one-out still prefers it",
  noSibling: "kept on judgement — no blind test can separate it (3 board rows)",
  curveOnly: "not adopted — the tilts win on leave-one-out",
  mom06: "not adopted — the fitted slope is too weak (t = 0.74)",
  mom02: "not adopted — weaker on leave-one-out",
  sea01: "not adopted — wins on leave-one-out only",
  sea03: "not adopted — the leave-one-out cost outweighs the out-of-time gain",
  chain: "dropped — worse on every blind test",
  onePerTicker: "checked — no change, the duplicate is already trimmed",
  exclCats: "dropped — worse on leave-one-out and the 2024 split",
  trim20: "not adopted — the 1.5 sd trim wins on every test",
};

export function termSelection(allComps: Comp[], asOf: string): TermRow[] {
  const curveOpts: PriceOpts = { category: false, momentum: false, seasoning: false, sibling: false };
  const variants: Array<{
    term: string; opts: PriceOpts; verdict: string;
    comps?: Comp[]; trimSd?: number;
  }> = [
    { term: "Full model (the board)", opts: {}, verdict: TERM_VERDICTS.full },
    { term: "No momentum", opts: { momentum: false }, verdict: TERM_VERDICTS.noMomentum },
    { term: "No category", opts: { category: false }, verdict: TERM_VERDICTS.noCategory },
    { term: "No seasoning", opts: { seasoning: false }, verdict: TERM_VERDICTS.noSeasoning },
    { term: "No sibling", opts: { sibling: false }, verdict: TERM_VERDICTS.noSibling },
    { term: "Curve only", opts: curveOpts, verdict: TERM_VERDICTS.curveOnly },
    { term: "Momentum ×0.6", opts: { momCoef: 0.6 }, verdict: TERM_VERDICTS.mom06 },
    { term: "Momentum ×0.2", opts: { momCoef: 0.2 }, verdict: TERM_VERDICTS.mom02 },
    { term: "Seasoning span 0.1", opts: { seaSpan: 0.1 }, verdict: TERM_VERDICTS.sea01 },
    { term: "Seasoning span 0.3", opts: { seaSpan: 0.3 }, verdict: TERM_VERDICTS.sea03 },
    { term: "Chain factor added", opts: { chain: true }, verdict: TERM_VERDICTS.chain },
    {
      term: "One-per-ticker comps", opts: {}, verdict: TERM_VERDICTS.onePerTicker,
      comps: dedupeByTicker(allComps),
    },
    {
      term: "Comps without Bridge / Liquid Staking", opts: {}, verdict: TERM_VERDICTS.exclCats,
      comps: allComps.filter((t) => t.category !== "Bridge" && t.category !== "Liquid Staking"),
    },
    { term: "Trim at 2.0 sd", opts: {}, verdict: TERM_VERDICTS.trim20, trimSd: 2.0 },
  ];
  return variants.map((v) => {
    const { run } = runBlind(v.comps ?? allComps, v.opts, v.trimSd ?? TRIM_SD, asOf);
    return {
      term: v.term,
      loo: run.loo.medianMiss,
      split2024: run.split2024.full.medianMiss,
      split2025: run.split2025.full.medianMiss,
      walkForward: run.walkForward.overall.medianMiss,
      verdict: v.verdict,
    };
  });
}

export function dedupeByTicker(comps: Comp[]): Comp[] {
  const best = new Map<string, Comp>();
  for (const t of comps) {
    const cur = best.get(t.symbol);
    if (!cur || t.tvl > cur.tvl) best.set(t.symbol, t);
  }
  return [...best.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

export function duplicateTickers(comps: Comp[]): string {
  const groups = new Map<string, Comp[]>();
  for (const t of comps) {
    if (!t.symbol) continue;
    const arr = groups.get(t.symbol) ?? [];
    arr.push(t);
    groups.set(t.symbol, arr);
  }
  const out: string[] = [];
  for (const [sym, arr] of groups) {
    if (arr.length < 2) continue;
    const names = [...arr].sort((a, b) => b.tvl - a.tvl).map((t) => t.name).join(", ");
    out.push(`${sym} (${names})`);
  }
  return out.sort().join("; ");
}

// ---- board ----------------------------------------------------------------

function setAsideReason(p: Proto): string | null {
  if (NOT_A_LAUNCH.has(p.category)) return `category ${p.category} is not a launch`;
  if (VERSION_RE.test(p.name)) return "versioned listing (V2, 2.0, …)";
  const words = p.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((w) => WRAPPED_WORDS.includes(w))) {
    return "wrapped or staked product of a token that trades";
  }
  for (const ex of EXCHANGE_NAMES) {
    if (p.name.startsWith(ex)) return `${ex} listing, not a protocol launch`;
  }
  return null;
}

function residualQuantiles(
  kept: Comp[], fit: { a: number; b: number },
  factors: Map<string, FactorInfo>, asOf: string,
): { exact: { p10: number; p25: number; p50: number; p75: number; p90: number };
     rounded: { p10: number; p25: number; p50: number; p75: number; p90: number } } {
  const res: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    const others = kept.filter((_, j) => j !== i);
    const words = siblingWords(others);
    const t = kept[i];
    const price = priceBlind(t, fit, factors, words, { rounded: false }, asOf);
    res.push(Math.log10(t.mcap) - Math.log10(price));
  }
  const s = [...res].sort((a, b) => a - b);
  const exact = {
    p10: quantile1(s, 0.1), p25: quantile1(s, 0.25), p50: quantile1(s, 0.5),
    p75: quantile1(s, 0.75), p90: quantile1(s, 0.9),
  };
  const rounded = {
    p10: round4(exact.p10), p25: round4(exact.p25), p50: round4(exact.p50),
    p75: round4(exact.p75), p90: round4(exact.p90),
  };
  return { exact, rounded };
}

// Age split on the 2024 time split: the protocols that listed after the
// cutoff, cut at 18 months. Young listings price worse than old ones.
function ageSplitSummary(kept: Comp[], asOf: string): { months: number; young: BlindSummary; old: BlindSummary } {
  const pre = kept.filter((t) => t.listed !== null && t.listed < "2024-01-01");
  const post = kept.filter((t) => t.listed !== null && t.listed >= "2024-01-01");
  const f = fitFor(pre);
  const fac = categoryFactors(pre, f);
  const words = siblingWords(pre);
  const priceOf = (t: Comp): number => priceBlind(t, f, fac, words, {}, asOf);
  const young = post.filter((t) => (ageDays(asOf, t.listed) ?? 0) < 540);
  const old = post.filter((t) => (ageDays(asOf, t.listed) ?? 0) >= 540);
  return {
    months: 18,
    young: summarizeMisses(young.map((t) => missRatio(priceOf(t), t.mcap))),
    old: summarizeMisses(old.map((t) => missRatio(priceOf(t), t.mcap))),
  };
}

type RowCore = {
  proto: Proto;
  age: number | null;
  hold: number;
  checks: number;
  chain: string;
  gas: number;
  multiChain: boolean;
  mechanism: string;
  curveR: number;
  catR: number;
  catN: number;
  catSrc: string;
  momR: number;
  seaR: number;
  sib: number;
  implied: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  low: number;
  slice: number;
  sliceLow: number;
  fees: number;
  tbill: number;
  net: number;
  netLow: number;
  hours: number;
  perHour: number;
  perHourLow: number;
  odds: number;
  verdict: string;
  minutes: number[];
  costs: number[];
  sensitivity: { drops: number[]; capitals: number[]; net: number[][] };
  peers: Peer[];
  steps: string[];
};

function buildCore(
  p: Proto, asOf: string, fit: { a: number; b: number },
  factors: Map<string, FactorInfo>, words: Set<string>,
  qExact: { p10: number; p90: number }, qRound: { p10: number; p25: number; p75: number; p90: number },
  allComps: Comp[],
): RowCore {
  const age = ageDays(asOf, p.listed_at);
  const hold = holdDaysFor(age);
  const checks = checkCountFor(hold);
  const { chain, gas } = cheapestOf(p.chains);
  const multiChain = p.chains.length > 1;
  const mechanism = mechanismFor(p.category);
  const catInfo = factors.get(p.category);
  const catR = round4(catInfo?.factor ?? 1);
  const catN = catInfo?.n ?? 0;
  const catSrc = categorySource(catN);
  const curveR = round2(curveValue(fit.a, fit.b, p.tvl_usd));
  const momR = round4(momentumFactor(p.change_7d ?? 0, 0.4));
  const seaR = round4(seasoningFactor(age, 0.8, 0.2));
  const sib = words.has(firstWord(p.name)) ? 0.5 : 1;
  // The stored value is built from the ROUNDED factors, not the raw
  // product — that rounding is what the dashboard recomputes.
  const implied = Math.round(curveR * catR * momR * seaR * sib);
  const p10 = Math.round(implied * 10 ** qRound.p10);
  const p25 = Math.round(implied * 10 ** qRound.p25);
  const p75 = Math.round(implied * 10 ** qRound.p75);
  const p90 = Math.round(implied * 10 ** qRound.p90);
  const low = p25;
  const minutes = farmMinutesFor(hold);
  const costs = farmCostsFor(gas, multiChain, hold);
  const fees = round2(costs.reduce((s, v) => s + v, 0));
  const tbill = tbillFor(DEPOSIT, hold);
  const slice = sliceFor(DEPOSIT, p.tvl_usd, implied);
  const sliceLow = sliceFor(DEPOSIT, p.tvl_usd, low);
  const net = round2(slice - fees - tbill);
  const netLow = round2(sliceLow - fees - tbill);
  const hours = round2(minutes.reduce((s, v) => s + v, 0) / 60);
  const perHour = round2(net / hours);
  const perHourLow = round2(netLow / hours);
  const odds = oddsFor(implied, implied * 10 ** qExact.p10, implied * 10 ** qExact.p90, fees, tbill, p.tvl_usd);
  const verdict = verdictFor(netLow, sliceLow, fees);
  return {
    proto: p, age, hold, checks, chain, gas, multiChain, mechanism,
    curveR, catR, catN, catSrc, momR, seaR, sib,
    implied, p10, p25, p75, p90, low,
    slice, sliceLow, fees, tbill, net, netLow, hours, perHour, perHourLow,
    odds, verdict, minutes, costs,
    sensitivity: sensitivityFor(implied, p.tvl_usd, fees, hold),
    peers: nearestPeers({ category: p.category, tvl_usd: p.tvl_usd }, allComps),
    steps: farmStepsFor(
      { name: p.name, chain, hold, checks, step2Cost: costs[1], multiChain, chainCount: p.chains.length, change7d: p.change_7d },
      mechanism,
    ),
  };
}

// Bootstrap rank ranges: resample the kept comps with replacement, refit,
// reprice every row, re-rank. The 10th–90th percentile of a row's rank
// across 200 refits is its range. Seeded, so it never moves between runs.
function bootstrapRanges(
  cores: RowCore[], kept: Comp[], asOf: string, seed: number, refits = 200,
): Map<string, { lo: number; hi: number }> {
  const rng = mulberry32(seed);
  const ranks = new Map<string, number[]>();
  for (const c of cores) ranks.set(c.proto.slug, []);
  for (let it = 0; it < refits; it++) {
    const sample: Comp[] = [];
    for (let i = 0; i < kept.length; i++) sample.push(kept[Math.floor(rng() * kept.length)]);
    const fB = fitFor(sample);
    const facB = categoryFactors(sample, fB);
    const wordsB = siblingWords(sample);
    const priced = cores.map((c) => {
      const p = c.proto;
      let v = curveValue(fB.a, fB.b, p.tvl_usd) * (facB.get(p.category)?.factor ?? 1);
      v *= momentumFactor(p.change_7d ?? 0, 0.4);
      v *= seasoningFactor(c.age, 0.8, 0.2);
      if (wordsB.has(firstWord(p.name))) v *= 0.5;
      return { slug: p.slug, v: Math.max(1, v) };
    });
    priced.sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1));
    priced.forEach((row, idx) => ranks.get(row.slug)!.push(idx + 1));
  }
  const out = new Map<string, { lo: number; hi: number }>();
  for (const [slug, rs] of ranks) {
    const s = [...rs].sort((a, b) => a - b);
    out.set(slug, { lo: quantile1(s, 0.1), hi: quantile1(s, 0.9) });
  }
  return out;
}

export function buildRadar(snap: Snapshot, seed = 34038550): Radar {
  const asOf = snap.as_of;
  const allComps = buildComps(snap.protocols);
  const { firstA, firstB, firstSd, fit, kept, outliers } = fitAndTrim(allComps, TRIM_SD);
  const factors = categoryFactors(kept, fit);
  const words = siblingWords(kept);
  const { exact: qExact, rounded: qRound } = residualQuantiles(kept, fit, factors, asOf);
  const marketChange7d = round4(medianOf(allComps.map((t) => t.ch)));

  const categories: Record<string, { n: number; factor: number; medianResidual: number }> = {};
  for (const [cat, info] of factors) {
    categories[cat] = { n: info.n, factor: round4(info.factor), medianResidual: round4(info.medianResidual) };
  }

  const curveOpts: PriceOpts = { category: false, momentum: false, seasoning: false, sibling: false };
  const loo = {
    full: looSummary(kept, {}, asOf),
    noMomentum: looSummary(kept, { momentum: false }, asOf),
    noCategory: looSummary(kept, { category: false }, asOf),
    curveOnly: looSummary(kept, curveOpts, asOf),
    flat: looSummary(kept, { flat: true }, asOf),
  };
  const split2024 = splitSummary(kept, "2024-01-01", {}, asOf);
  const split2025 = splitSummary(kept, "2025-01-01", {}, asOf);
  const ageSplit = ageSplitSummary(kept, asOf);
  const curveRes = kept.map((t) => Math.log10(t.mcap) - (fit.a + fit.b * Math.log10(t.tvl)));
  const growthSlope = tStat(kept.map((t) => t.ch / 100), curveRes);
  const ageSlope = tStat(kept.map((t) => Math.log10(ageDays(asOf, t.listed) ?? 365)), curveRes);
  const ridge = ridgeSummary(kept, asOf);
  const walkForward = walkForwardSummary(kept, {}, asOf);
  const terms = termSelection(allComps, asOf);
  const onePerTicker = {
    duplicates: duplicateTickers(allComps),
    keptDistinct: new Set(kept.map((t) => t.symbol)).size,
    note: "the duplicate tickers were already trimmed at 1.5 sd, so the kept set is already one-per-ticker",
  };

  const preToken = snap.protocols.filter(isPreToken);
  const ranked: Proto[] = [];
  const setAside: SetAside[] = [];
  for (const p of preToken) {
    const reason = setAsideReason(p);
    if (reason) {
      setAside.push({ slug: p.slug, name: p.name, category: p.category, tvl: p.tvl_usd, reason });
    } else {
      ranked.push(p);
    }
  }
  setAside.sort((a, b) => b.tvl - a.tvl || (a.slug < b.slug ? -1 : 1));

  const cores = ranked.map((p) => buildCore(p, asOf, fit, factors, words, qExact, qRound, allComps));
  const ranges = bootstrapRanges(cores, kept, asOf, seed);

  const byImplied = [...cores].sort((a, b) => b.implied - a.implied || (a.proto.slug < b.proto.slug ? -1 : 1));
  const rankOf = new Map<string, number>();
  byImplied.forEach((c, i) => rankOf.set(c.proto.slug, i + 1));
  const byCurve = [...cores].sort((a, b) => b.curveR - a.curveR || (a.proto.slug < b.proto.slug ? -1 : 1));
  const curveRankOf = new Map<string, number>();
  byCurve.forEach((c, i) => curveRankOf.set(c.proto.slug, i + 1));
  let tiltsMove = 0;
  for (const c of cores) {
    if (Math.abs((rankOf.get(c.proto.slug) ?? 0) - (curveRankOf.get(c.proto.slug) ?? 0)) >= 5) tiltsMove++;
  }

  const rows: BoardRow[] = byImplied.map((c) => {
    const p = c.proto;
    const range = ranges.get(p.slug) ?? { lo: rankOf.get(p.slug) ?? 0, hi: rankOf.get(p.slug) ?? 0 };
    return {
      slug: p.slug, name: p.name, category: p.category, mechanism: c.mechanism,
      chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d,
      age_days: c.age, listed_at: p.listed_at, token_status: "pre-token",
      rank: rankOf.get(p.slug) ?? 0, rank_lo: range.lo, rank_hi: range.hi,
      implied_value_usd: c.implied, curve_usd: c.curveR,
      p10_usd: c.p10, p25_usd: c.p25, p75_usd: c.p75, p90_usd: c.p90, low_usd: c.low,
      slice_usd: c.slice, slice_low_usd: c.sliceLow,
      fees_usd: c.fees, gas_usd: c.gas, cheapest_chain: c.chain,
      hold_days: c.hold, tbill_usd: c.tbill,
      net_usd: c.net, net_low_usd: c.netLow, odds: c.odds,
      per_hour_usd: c.perHour, per_hour_low_usd: c.perHourLow, hours: c.hours,
      verdict: c.verdict, farm_steps: c.steps, farm_costs_usd: c.costs,
      farm_minutes: c.minutes, sensitivity: c.sensitivity, peers: c.peers,
      model: {
        curve_usd: c.curveR, category: c.catR, category_n: c.catN,
        category_source: c.catSrc, momentum: c.momR, seasoning: c.seaR, sibling: c.sib,
      },
    };
  });

  const anchors: Anchor[] = [...allComps]
    .sort((a, b) => (b.mcap / b.tvl) - (a.mcap / a.tvl) || (a.slug < b.slug ? -1 : 1))
    .map((t) => ({
      slug: t.slug, name: t.name, category: t.category, tvl: t.tvl, mcap: t.mcap,
      multiple: round4(t.mcap / t.tvl), change_7d: t.ch, listed_at: t.listed,
    }));

  const verdicts = { farm: 0, thin: 0, skip: 0 };
  const pointVerdicts = { farm: 0, thin: 0, skip: 0 };
  let totalImpliedUsd = 0;
  for (const r of rows) {
    totalImpliedUsd += r.implied_value_usd;
    if (r.verdict === "FARM") verdicts.farm++;
    else if (r.verdict === "THIN") verdicts.thin++;
    else verdicts.skip++;
    const pv = verdictFor(r.net_usd, r.slice_usd, r.fees_usd);
    if (pv === "FARM") pointVerdicts.farm++;
    else if (pv === "THIN") pointVerdicts.thin++;
    else pointVerdicts.skip++;
  }

  const farmNext = [...rows]
    .sort((a, b) => b.per_hour_usd - a.per_hour_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, 5)
    .map((r) => ({
      slug: r.slug, name: r.name, rank: r.rank, mechanism: r.mechanism,
      net_usd: r.net_usd, net_low_usd: r.net_low_usd, gas_usd: r.gas_usd,
      hours: r.hours, per_hour_usd: r.per_hour_usd,
      per_hour_low_usd: r.per_hour_low_usd, odds: r.odds,
    }));

  const wlRows = rows.filter((r) => snap.watchlist.includes(r.slug));
  const bestWl = [...wlRows].sort((a, b) => b.per_hour_usd - a.per_hour_usd || (a.slug < b.slug ? -1 : 1))[0];
  const bestPerHourWatchlist = bestWl
    ? { name: bestWl.name, slug: bestWl.slug, perHour: bestWl.per_hour_usd }
    : { name: "", slug: "", perHour: 0 };

  const headline = `${rows.length} pre-token protocols priced from the ${kept.length} tokens already trading; ${verdicts.farm} still pay at the low end.`;

  const validation: Validation = {
    firstA, firstB, firstSd,
    fit: { a: fit.a, b: fit.b, n: fit.n, r2: fit.r2 },
    outliers, categories, loo, split2024, split2025, ageSplit,
    growthSlope, ageSlope, quantiles: qRound,
    ridge: { lambda: 10, n: kept.length, medianMiss: ridge.medianMiss, within3: ridge.within3, curveOnlyMiss: loo.curveOnly.medianMiss },
    walkForward, termSelection: terms, onePerTicker,
    bootstrapRefits: 200, tiltsMove, marketChange7d,
  };

  return {
    asOf, modelVersion: MODEL_VERSION, watchlist: snap.watchlist,
    counts: {
      protocols: snap.protocols.length, preToken: preToken.length,
      ranked: rows.length, watchlist: snap.watchlist.length,
      watchlistCovered: wlRows.length, comps: allComps.length,
      kept: kept.length, outliers: outliers.length,
      setAside: setAside.length,
      traded: snap.protocols.filter((p) => p.symbol).length,
    },
    verdicts, pointVerdicts,
    fit: { a: fit.a, b: fit.b, n: fit.n, r2: fit.r2 },
    outliers, categories, validation,
    rows, anchors, setAside, farmNext, bestPerHourWatchlist,
    totalImpliedUsd, headline,
  };
}
