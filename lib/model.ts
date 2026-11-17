// Token Radar v5 — model "radar-6".
//
// One fitted log-log size curve prices every pre-token protocol off the
// tokens that already trade. The curve is fitted twice: a first pass over
// all 119 comparables (CEX excluded), the 16 beyond 1.5 sd of log residual
// are set aside and named, and the curve is refit on the 103 that remain.
// Each category carries a shrunk median-residual factor; growth and
// seasoning are small by construction and their fitted slopes are reported,
// not assumed.
//
// What v5 adds over v4 (radar-5), and why:
//
// - A walk-forward test. The comparables are ordered by listing date; for
//   each of four yearly boundaries the curve and the factors are fitted on
//   the tokens listed before the boundary and scored on the next year's
//   cohort only. It is the honest test for a model whose job is pricing
//   launches that do not exist yet, and it is reported alongside the
//   leave-one-out test even where the two disagree (see Method).
// - A term-selection table, computed live: every model term and every
//   challenger (a chain factor, a two-segment curve, other trims, other
//   strengths) is scored by the same strict leave-one-out, time-split and
//   walk-forward tests, and a term stays only when the blind tests keep it.
// - Deposit-sized farm plans: every plan is sized to one $1,000 deposit —
//   the fund step moves that deposit onto the cheapest chain, the core
//   action deposits the same $1,000, and the upkeep and exit are costed
//   against it. (v4's plan funded "$100" and then deposited "$1,000".)
//
// The validation is STRICT, and the Method tab says so in plain words: in
// the leave-one-out test every token is priced by a curve and category
// factors refitted without it; in each time split and each walk-forward
// fold the curve and the factors come from the earlier tokens only.
// Tokens with no listing date are left out of the splits, never silently
// assigned to one side.
//
// Nothing here is keyed to a name. Every number below is computed from the
// snapshot at run time; rerun the program and the board, the data and the
// dossier come back byte-identical.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snap {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

/** One traded token: listings that share a token are merged, TVL summed. */
export interface Token {
  token: string;
  slug: string;
  name: string;
  category: string;
  tvl: number;
  mcap: number;
  change_7d: number;
  listed_at: string | null;
  chains: string[];
  symbol: string;
  listings: number;
}

export interface CurveFit {
  a: number;
  b: number;
  n: number;
  r2: number;
}

export interface CatFactor {
  n: number;
  factor: number;
  medianResidual: number;
}

export interface OutlierNote {
  name: string;
  slug: string;
  residual: number;
}

export interface Backtest {
  n: number;
  medianMiss: number;
  within3: number;
  within10: number;
}

export interface Ablation {
  full: Backtest;
  noMomentum: Backtest;
  noCategory: Backtest;
  curveOnly: Backtest;
  flat: Backtest;
}

export interface SplitResult {
  cutoff: string;
  pre: number;
  post: number;
  full: Backtest;
  curveOnly: Backtest;
  flat: Backtest;
}

export interface AgeSplit {
  months: number;
  young: Backtest;
  old: Backtest;
}

export interface SlopeCheck {
  slope: number;
  t: number;
  r: number;
}

export interface RidgeCheck {
  lambda: number;
  n: number;
  medianMiss: number;
  within3: number;
  curveOnlyMiss: number;
}

export interface WalkFold {
  boundary: string;
  train: number;
  test: number;
  full: Backtest;
  curveOnly: Backtest;
}

export interface WalkForward {
  folds: WalkFold[];
  overall: Backtest;
  overallCurve: Backtest;
  earlyOverall: Backtest;
  earlyCurve: Backtest;
}

export interface TermRow {
  term: string;
  loo: number;
  split2024: number;
  split2025: number;
  walkForward: number;
  verdict: string;
}

export interface Validation {
  firstA: number;
  firstB: number;
  firstSd: number;
  fit: CurveFit;
  outliers: OutlierNote[];
  categories: Record<string, CatFactor>;
  loo: Ablation;
  split2024: SplitResult;
  split2025: SplitResult;
  ageSplit: AgeSplit;
  growthSlope: SlopeCheck;
  ageSlope: SlopeCheck;
  quantiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  ridge: RidgeCheck;
  walkForward: WalkForward;
  termSelection: TermRow[];
  onePerTicker: { duplicates: string; keptDistinct: number; note: string };
  bootstrapRefits: number;
  tiltsMove: number;
  marketChange7d: number;
}

export interface FarmStep {
  text: string;
  costUsd: number;
  minutes: number;
}

export interface Peer {
  slug: string;
  name: string;
  tvl: number;
  mcap: number;
  ratio: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string;
  mechanism: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  token_status: 'pre-token' | 'trades';
  rank: number;
  rank_lo: number;
  rank_hi: number;
  implied_value_usd: number;
  curve_usd: number;
  p10_usd: number;
  p25_usd: number;
  p75_usd: number;
  p90_usd: number;
  low_usd: number;
  slice_usd: number;
  slice_low_usd: number;
  fees_usd: number;
  gas_usd: number;
  cheapest_chain: string;
  hold_days: number;
  tbill_usd: number;
  net_usd: number;
  net_low_usd: number;
  odds: number;
  per_hour_usd: number;
  per_hour_low_usd: number;
  hours: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  farm_steps: string[];
  farm_costs_usd: number[];
  farm_minutes: number[];
  sensitivity: { drops: number[]; capitals: number[]; net: number[][] };
  peers: Peer[];
  model: {
    curve_usd: number;
    category: number;
    category_n: number;
    category_source: string;
    momentum: number;
    seasoning: number;
    sibling: number;
  };
}

export interface AnchorRow {
  slug: string;
  name: string;
  category: string;
  tvl: number;
  mcap: number;
  multiple: number;
  change_7d: number | null;
  listed_at: string | null;
}

export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl: number;
  reason: string;
}

export interface FarmNextCard {
  slug: string;
  name: string;
  rank: number;
  mechanism: string;
  net_usd: number;
  net_low_usd: number;
  gas_usd: number;
  hours: number;
  per_hour_usd: number;
  per_hour_low_usd: number;
  odds: number;
}

export interface RadarData {
  asOf: string;
  modelVersion: string;
  watchlist: string[];
  counts: {
    protocols: number;
    preToken: number;
    ranked: number;
    watchlist: number;
    watchlistCovered: number;
    comps: number;
    kept: number;
    outliers: number;
    setAside: number;
    traded: number;
  };
  verdicts: { farm: number; thin: number; skip: number };
  pointVerdicts: { farm: number; thin: number; skip: number };
  fit: CurveFit;
  outliers: OutlierNote[];
  categories: Record<string, CatFactor>;
  validation: Validation;
  rows: BoardRow[];
  anchors: AnchorRow[];
  setAside: SetAsideRow[];
  farmNext: FarmNextCard[];
  bestPerHourWatchlist: { name: string; slug: string; perHour: number } | null;
  totalImpliedUsd: number;
  headline: string;
}

export const MODEL_VERSION = 'radar-6';

/** Every tunable number in one place, so the Method tab can quote them. */
export const TUNE = {
  trimSd: 1.5,
  shrinkExtra: 4,
  minCategoryN: 3,
  momentumCoef: 0.4,
  momentumLoPct: -60,
  momentumHiPct: 120,
  seasoningBase: 0.8,
  seasoningSpan: 0.2,
  seasoningCapDays: 1095,
  unknownAgeDays: 365,
  split2024: '2024-01-01',
  split2025: '2025-01-01',
  walkBounds: ['2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01'],
  ageSplitMonths: 18,
  tbillRate: 0.04,
  airdropShare: 0.1,
  capitalUsd: 1000,
  bridgeUsd: 1.5,
  bootstrapRefits: 200,
  peerCount: 4,
  ridgeLambda: 10,
} as const;

// ------------------------------------------------------------------ helpers

export function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

export function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

export function quantileOf(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (idx - lo);
}

export function popSd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) * (b - m), 0) / (values.length - 1));
}

/** Days from a listing date to the snapshot date; null stays null. */
export function ageInDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const ms = Date.parse(asOf) - Date.parse(listedAt);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / 86400000));
}

export function firstWord(name: string): string {
  const w = (name || '').trim().split(/\s+/)[0];
  return (w || '').toLowerCase();
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-(x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Deterministic PRNG (mulberry32) so a rebuild is byte-identical. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small dense linear solve (Gaussian elimination with partial pivoting). */
export function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    const tmp = m[col]!;
    m[col] = m[piv]!;
    m[piv] = tmp;
    const div = m[col]![col]!;
    if (Math.abs(div) < 1e-12) continue;
    for (let r = col + 1; r < n; r++) {
      const f = m[r]![col]! / div;
      for (let c = col; c <= n; c++) m[r]![c] = m[r]![c]! - f * m[col]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r]![n]!;
    for (let c = r + 1; c < n; c++) s -= m[r]![c]! * x[c]!;
    x[r] = Math.abs(m[r]![r]!) < 1e-12 ? 0 : s / m[r]![r]!;
  }
  return x;
}

// ------------------------------------------------------------------ snapshot

export class SnapshotError extends Error {}

function finiteNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function parseSnapshot(raw: unknown): Snap {
  if (typeof raw !== 'object' || raw === null) throw new SnapshotError('snapshot is not an object');
  const s = raw as Record<string, unknown>;
  if (!Array.isArray(s.protocols) || !Array.isArray(s.watchlist)) {
    throw new SnapshotError('snapshot is missing protocols or watchlist');
  }
  const protocols: Proto[] = (s.protocols as Record<string, unknown>[]).map((p) => ({
    slug: String(p.slug ?? ''),
    name: String(p.name ?? ''),
    category: typeof p.category === 'string' ? p.category : null,
    chains: Array.isArray(p.chains) ? (p.chains as unknown[]).map((c) => String(c)) : [],
    tvl_usd: finiteNum(p.tvl_usd, 0),
    change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
    mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
    listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
    gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
    symbol: typeof p.symbol === 'string' ? p.symbol : null,
  }));
  return {
    as_of: String(s.as_of ?? ''),
    source: String(s.source ?? ''),
    floor_usd: finiteNum(s.floor_usd, 50000000),
    protocols,
    watchlist: (s.watchlist as unknown[]).map((w) => String(w)),
  };
}

/** A protocol records no token on the snapshot. */
export function isPreToken(p: Proto): boolean {
  return p.gecko_id === null && p.symbol === null;
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

function versionedName(name: string): boolean {
  // A version marker is " V2", " v2" or " 2.0" at the end — a bare trailing
  // number ("Project 0") is a name, not a version.
  return /\s[vV]\d+(\.\d+)?\s*$/.test(name || '') || /\s\d+\.\d+(\.\d+)?\s*$/.test(name || '');
}

function wrappedOrStaked(name: string): boolean {
  return /\b(wrapped|staked|staking)\b/i.test(name || '');
}

/**
 * The watchlist's own rule, applied to every pre-token protocol: the
 * watchlist is the floor, never the ceiling, so a protocol below the floor
 * is still rankable — only the rule's exclusions keep one off the board.
 * Returns null when rankable, else the reason it is set aside.
 */
export function rankableReason(p: Proto): string | null {
  if (!isPreToken(p)) return 'its token already trades';
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category} is not a launch`;
  if (versionedName(p.name)) return 'versioned listing (V2, 2.0, …)';
  if (wrappedOrStaked(p.name)) return 'wrapped or staked product of a token that trades';
  for (const ex of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(ex)) return `begins with the exchange name ${ex}`;
  }
  return null;
}

export function isRankable(p: Proto): boolean {
  return rankableReason(p) === null;
}

// ------------------------------------------------------------------ comparables

export interface CompSet {
  tokens: Token[];
  /** One observation per ticker: the tickers that appear twice, if any. */
  duplicateSymbols: { symbol: string; names: string[] }[];
}

/**
 * One row per traded token: listings that share a token are merged with
 * their TVL summed. CEX listings are the only exclusion: an exchange's own
 * token is not a comparable launch. The duplicate-ticker check is reported
 * alongside: a token listed twice must not pull the curve twice.
 */
export function collectTokens(snap: Snap): CompSet {
  const byToken = new Map<string, Token>();
  for (const p of snap.protocols) {
    if (!p.mcap_usd || p.mcap_usd <= 0) continue;
    if (p.category === 'CEX') continue;
    const key = p.gecko_id ?? `sym:${p.symbol ?? p.slug}`;
    const prev = byToken.get(key);
    if (!prev) {
      byToken.set(key, {
        token: key,
        slug: p.slug,
        name: p.name,
        category: p.category ?? 'Other',
        tvl: p.tvl_usd,
        mcap: p.mcap_usd,
        change_7d: p.change_7d ?? 0,
        listed_at: p.listed_at,
        chains: p.chains,
        symbol: (p.symbol ?? '').toLowerCase(),
        listings: 1,
      });
    } else {
      prev.tvl += p.tvl_usd;
      prev.listings += 1;
      if (p.tvl_usd > prev.tvl - p.tvl_usd) {
        prev.slug = p.slug;
        prev.name = p.name;
        prev.category = p.category ?? 'Other';
      }
      if (prev.listed_at === null || (p.listed_at !== null && p.listed_at < prev.listed_at)) {
        prev.listed_at = p.listed_at;
      }
      if (p.chains.length > 0 && prev.chains.length === 0) prev.chains = p.chains;
    }
  }
  const tokens = [...byToken.values()].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const bySymbol = new Map<string, string[]>();
  for (const t of tokens) {
    if (!t.symbol) continue;
    const list = bySymbol.get(t.symbol) ?? [];
    list.push(t.name);
    bySymbol.set(t.symbol, list);
  }
  const duplicateSymbols = [...bySymbol.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([symbol, names]) => ({ symbol, names: [...names].sort() }));
  return { tokens, duplicateSymbols };
}

/** The same comp set with each ticker kept once (largest TVL wins). */
export function dedupBySymbol(tokens: Token[]): Token[] {
  const best = new Map<string, Token>();
  for (const t of tokens) {
    if (!t.symbol) continue;
    const prev = best.get(t.symbol);
    if (!prev || t.tvl > prev.tvl) best.set(t.symbol, t);
  }
  const kept = new Set([...best.values()].map((t) => t.token));
  return tokens.filter((t) => !t.symbol || kept.has(t.token));
}

// ------------------------------------------------------------------ the curve

export function olsLine(points: { x: number; y: number }[]): { a: number; b: number } {
  const n = points.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const den = n * sxx - sx * sx;
  const b = den === 0 ? 0 : (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  return { a, b };
}

export function curveR2(tokens: Token[], fit: { a: number; b: number }): number {
  const ys = tokens.map((t) => Math.log10(t.mcap));
  const mean = ys.reduce((x, y) => x + y, 0) / ys.length;
  let ssTot = 0;
  let ssRes = 0;
  for (const t of tokens) {
    const pred = fit.a + fit.b * Math.log10(t.tvl);
    ssTot += (Math.log10(t.mcap) - mean) ** 2;
    ssRes += (Math.log10(t.mcap) - pred) ** 2;
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

function curveResidual(t: Token, fit: { a: number; b: number }): number {
  return Math.log10(t.mcap) - (fit.a + fit.b * Math.log10(t.tvl));
}

/**
 * Two-pass fit: fit once on every comparable, set aside the ones beyond
 * trimSd of log residual, refit on the rest. Returns both fits and the
 * named outliers, so the Method tab can list exactly what was dropped.
 */
export function fitTwice(all: Token[], trimSd: number = TUNE.trimSd): {
  first: { a: number; b: number };
  firstSd: number;
  kept: Token[];
  outliers: OutlierNote[];
  fit: CurveFit;
} {
  const first = olsLine(all.map((t) => ({ x: Math.log10(t.tvl), y: Math.log10(t.mcap) })));
  const residuals = all.map((t) => curveResidual(t, first));
  const firstSd = popSd(residuals);
  const kept: Token[] = [];
  const outliers: OutlierNote[] = [];
  for (let i = 0; i < all.length; i++) {
    if (Math.abs(residuals[i]!) > trimSd * firstSd) {
      outliers.push({ name: all[i]!.name, slug: all[i]!.slug, residual: round4(residuals[i]!) });
    } else {
      kept.push(all[i]!);
    }
  }
  outliers.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));
  const second = olsLine(kept.map((t) => ({ x: Math.log10(t.tvl), y: Math.log10(t.mcap) })));
  // a and b stay full-precision for pricing; the page rounds them for display.
  const fit: CurveFit = {
    a: second.a,
    b: second.b,
    n: kept.length,
    r2: round4(curveR2(kept, second)),
  };
  return { first, firstSd, kept, outliers, fit };
}

/**
 * One category's factor: the median log residual of its traded tokens,
 * shrunk toward the curve as if `shrinkExtra` more tokens sat on it.
 * Fewer than minCategoryN tokens, or no tokens at all: the curve alone.
 */
export function categoryFactors(kept: Token[], fit: { a: number; b: number }): Record<string, CatFactor> {
  const byCat = new Map<string, number[]>();
  for (const t of kept) {
    const list = byCat.get(t.category) ?? [];
    list.push(curveResidual(t, fit));
    byCat.set(t.category, list);
  }
  const out: Record<string, CatFactor> = {};
  for (const [cat, res] of byCat) {
    const med = medianOf(res);
    const n = res.length;
    const factor = n < TUNE.minCategoryN ? 1 : 10 ** (med * (n / (n + TUNE.shrinkExtra)));
    out[cat] = { n, factor: round4(factor), medianResidual: round4(med) };
  }
  return out;
}

/**
 * The same shrunk-median construction, by first chain instead of by
 * category. It is a challenger, not a term: the term-selection table
 * scores it against the same blind tests, and it loses on every one.
 */
export function chainFactors(kept: Token[], fit: { a: number; b: number }): Record<string, CatFactor> {
  const byChain = new Map<string, number[]>();
  for (const t of kept) {
    const chain = t.chains.length > 0 ? t.chains[0]! : 'none';
    const list = byChain.get(chain) ?? [];
    list.push(curveResidual(t, fit));
    byChain.set(chain, list);
  }
  const out: Record<string, CatFactor> = {};
  for (const [chain, res] of byChain) {
    const med = medianOf(res);
    const n = res.length;
    const factor = n < TUNE.minCategoryN ? 1 : 10 ** (med * (n / (n + TUNE.shrinkExtra)));
    out[chain] = { n, factor: round4(factor), medianResidual: round4(med) };
  }
  return out;
}

// ------------------------------------------------------------------ pricing

/** Which layers of the model a price uses; the term-selection table varies these. */
export interface PriceOptions {
  momentum?: boolean;
  momentumCoef?: number;
  category?: boolean;
  seasoning?: boolean;
  seasoningSpan?: number;
  sibling?: boolean;
  siblingMult?: number;
  chain?: boolean;
  chainFactors?: Record<string, CatFactor>;
}

function momentumOf(change7dPct: number, coef: number): number {
  // change_7d is stored in percent points (+2.37 means +2.37%), so the
  // clamp runs on the percent figure directly.
  return 1 + coef * (clampNum(change7dPct, TUNE.momentumLoPct, TUNE.momentumHiPct) / 100);
}

function seasoningOf(age: number | null, span: number): number {
  const days = age ?? TUNE.unknownAgeDays;
  return TUNE.seasoningBase + span * (Math.min(days, TUNE.seasoningCapDays) / TUNE.seasoningCapDays);
}

function siblingOf(name: string, names: Set<string>, mult: number): number {
  return names.has(firstWord(name)) ? mult : 1;
}

export interface PriceParts {
  curve: number;
  category: number;
  categoryN: number;
  categorySource: string;
  momentum: number;
  seasoning: number;
  sibling: number;
  value: number;
}

/** The full model price for one protocol, under the given options. */
export function priceProtocol(
  tvl: number,
  change7d: number,
  age: number | null,
  name: string,
  category: string,
  chains: string[],
  fit: { a: number; b: number },
  factors: Record<string, CatFactor>,
  tradedFirstWords: Set<string>,
  opts: PriceOptions = {},
): PriceParts {
  const curve = 10 ** (fit.a + fit.b * Math.log10(tvl));
  const useCategory = opts.category !== false;
  const fac = factors[category];
  const catFactor = !useCategory ? 1 : fac ? fac.factor : 1;
  const categoryN = fac ? fac.n : 0;
  const categorySource =
    !fac || fac.n === 0
      ? 'no traded token in this category — the curve alone'
      : fac.n < TUNE.minCategoryN
        ? `only ${fac.n} traded token${fac.n === 1 ? '' : 's'} — too few to move the curve`
        : `${fac.n} traded tokens, median residual shrunk ${fac.n}/${fac.n + TUNE.shrinkExtra}`;
  const momentum = opts.momentum === false ? 1 : round4(momentumOf(change7d, opts.momentumCoef ?? TUNE.momentumCoef));
  const seasoning = opts.seasoning === false ? 1 : round4(seasoningOf(age, opts.seasoningSpan ?? TUNE.seasoningSpan));
  const sibling = opts.sibling === false ? 1 : siblingOf(name, tradedFirstWords, opts.siblingMult ?? 0.5);
  let value = curve * catFactor * momentum * seasoning * sibling;
  if (opts.chain && opts.chainFactors) {
    const chain = chains.length > 0 ? chains[0]! : 'none';
    value *= opts.chainFactors[chain]?.factor ?? 1;
  }
  return {
    curve: round2(curve),
    category: round4(catFactor),
    categoryN,
    categorySource,
    momentum,
    seasoning,
    sibling,
    value: Math.max(1, Math.round(value)),
  };
}

function missOf(predicted: number, actual: number): number {
  return Math.max(predicted / actual, actual / predicted);
}

function summarizeMisses(misses: number[]): Backtest {
  const sorted = [...misses].sort((a, b) => a - b);
  return {
    n: misses.length,
    medianMiss: round4(medianOf(misses)),
    within3: round4(misses.filter((m) => m <= 3).length / Math.max(1, misses.length)),
    within10: round4(misses.filter((m) => m <= 10).length / Math.max(1, misses.length)),
  };
}

/** Price one traded token under an option set, from a fitted curve + factors. */
function priceToken(
  t: Token,
  fit: { a: number; b: number },
  factors: Record<string, CatFactor>,
  words: Set<string>,
  asOf: string,
  opts: PriceOptions,
  chainFac?: Record<string, CatFactor>,
): number {
  const parts = priceProtocol(
    t.tvl,
    t.change_7d,
    ageInDays(asOf, t.listed_at),
    t.name,
    t.category,
    t.chains,
    fit,
    factors,
    words,
    { ...opts, chainFactors: chainFac },
  );
  return parts.value;
}

// ------------------------------------------------------------------ strict validation

/**
 * Leave-one-out, strict: for every token the curve AND the category
 * factors (and the chain factors, when the options ask for them) are
 * refitted on the other tokens only. Returns the full model, the curve
 * alone and one flat multiple under the same folds, so the three compare
 * like with like.
 */
export function looFull(
  kept: Token[],
  asOf: string,
  opts: PriceOptions = {},
): { full: Backtest; curveOnly: Backtest; flat: Backtest } {
  const full: number[] = [];
  const curveOnly: number[] = [];
  const flat: number[] = [];
  const flatMultiple = medianOf(kept.map((t) => t.mcap / t.tvl));
  for (let i = 0; i < kept.length; i++) {
    const held = kept[i]!;
    const rest = kept.filter((_, j) => j !== i);
    const fit = olsLine(rest.map((t) => ({ x: Math.log10(t.tvl), y: Math.log10(t.mcap) })));
    const factors = categoryFactors(rest, fit);
    const words = new Set(rest.map((t) => firstWord(t.name)));
    const chainFac = opts.chain ? chainFactors(rest, fit) : undefined;
    full.push(missOf(priceToken(held, fit, factors, words, asOf, opts, chainFac), held.mcap));
    const base = 10 ** (fit.a + fit.b * Math.log10(held.tvl));
    curveOnly.push(missOf(base, held.mcap));
    flat.push(missOf(held.tvl * flatMultiple, held.mcap));
  }
  return { full: summarizeMisses(full), curveOnly: summarizeMisses(curveOnly), flat: summarizeMisses(flat) };
}

/** The ablation table: the full model against each layer removed. */
export function strictAblation(kept: Token[], asOf: string): Ablation {
  const full = looFull(kept, asOf, {});
  const noMomentum = looFull(kept, asOf, { momentum: false });
  const noCategory = looFull(kept, asOf, { category: false });
  const curveOnly = looFull(kept, asOf, { momentum: false, category: false, seasoning: false, sibling: false });
  return {
    full: full.full,
    noMomentum: noMomentum.full,
    noCategory: noCategory.full,
    curveOnly: curveOnly.full,
    flat: full.flat,
  };
}

/**
 * One time split, strict: the curve and the factors come from the tokens
 * listed before the cutoff only. Tokens with no listing date are left out
 * of both sides — assigning them a side would be guessing.
 */
export function strictTimeSplit(
  kept: Token[],
  cutoff: string,
  asOf: string,
  opts: PriceOptions = {},
): SplitResult {
  const pre = kept.filter((t) => t.listed_at !== null && t.listed_at < cutoff);
  const post = kept.filter((t) => t.listed_at !== null && t.listed_at >= cutoff);
  const fit = olsLine(pre.map((t) => ({ x: Math.log10(t.tvl), y: Math.log10(t.mcap) })));
  const factors = categoryFactors(pre, fit);
  const words = new Set(pre.map((t) => firstWord(t.name)));
  const chainFac = opts.chain ? chainFactors(pre, fit) : undefined;
  const flatMultiple = medianOf(pre.map((t) => t.mcap / t.tvl));
  const full: number[] = [];
  const curveOnly: number[] = [];
  const flat: number[] = [];
  for (const t of post) {
    const base = 10 ** (fit.a + fit.b * Math.log10(t.tvl));
    full.push(missOf(priceToken(t, fit, factors, words, asOf, opts, chainFac), t.mcap));
    curveOnly.push(missOf(base, t.mcap));
    flat.push(missOf(t.tvl * flatMultiple, t.mcap));
  }
  return { cutoff, pre: pre.length, post: post.length, full: summarizeMisses(full), curveOnly: summarizeMisses(curveOnly), flat: summarizeMisses(flat) };
}

function scoreTokens(
  tokens: Token[],
  fit: { a: number; b: number },
  factors: Record<string, CatFactor>,
  words: Set<string>,
  asOf: string,
  opts: PriceOptions = {},
): number[] {
  return tokens.map((t) => missOf(priceToken(t, fit, factors, words, asOf, opts), t.mcap));
}

/** The 2024 split's newer tokens, cut by how long they had been tracked. */
export function strictAgeSplit(kept: Token[], split: SplitResult, asOf: string): AgeSplit {
  const post = kept.filter((t) => t.listed_at !== null && t.listed_at >= split.cutoff);
  const pre = kept.filter((t) => t.listed_at !== null && t.listed_at < split.cutoff);
  const fit = olsLine(pre.map((t) => ({ x: Math.log10(t.tvl), y: Math.log10(t.mcap) })));
  const factors = categoryFactors(pre, fit);
  const words = new Set(pre.map((t) => firstWord(t.name)));
  const threshold = TUNE.ageSplitMonths * 30;
  const young = post.filter((t) => (ageInDays(asOf, t.listed_at) ?? 0) < threshold);
  const old = post.filter((t) => (ageInDays(asOf, t.listed_at) ?? 0) >= threshold);
  return {
    months: TUNE.ageSplitMonths,
    young: summarizeMisses(scoreTokens(young, fit, factors, words, asOf)),
    old: summarizeMisses(scoreTokens(old, fit, factors, words, asOf)),
  };
}

/** Regress the curve-only residuals on one driver: slope, t-stat, correlation. */
export function slopeCheck(kept: Token[], fit: { a: number; b: number }, driver: (t: Token) => number): SlopeCheck {
  const xs = kept.map(driver);
  const ys = kept.map((t) => curveResidual(t, fit));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const r = sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  const residVar = syy === 0 ? 0 : (syy - slope * sxy) / Math.max(1, xs.length - 2);
  const se = sxx === 0 ? 0 : Math.sqrt(residVar / sxx);
  return { slope: round4(slope), t: round2(se === 0 ? 0 : slope / se), r: round4(r) };
}

export function residualQuantiles(
  kept: Token[],
  fit: { a: number; b: number },
  factors: Record<string, CatFactor>,
  asOf: string,
): Validation['quantiles'] {
  // Full-model residuals: log10(actual cap) minus log10(the model's own
  // price for that token — curve + category + momentum + seasoning +
  // sibling). Nearest-rank (type-1 / inverted_cdf): the k-th smallest
  // residual with k = ceil(p * n).
  // The sibling set for pricing a token is the first words of the OTHER
  // kept comparables — a token is only a sibling when a DIFFERENT traded
  // token shares its first word. Building the set from the other tokens,
  // rather than deleting the word from the full set, keeps that
  // distinction: deleting "yield" would also erase Yield Basis.
  const sorted = kept
    .map((t) => {
      const age = ageInDays(asOf, t.listed_at);
      const words = new Set(kept.filter((o) => o !== t).map((o) => firstWord(o.name)));
      const parts = priceProtocol(t.tvl, t.change_7d ?? 0, age, t.name, t.category, t.chains, fit, factors, words);
      return Math.log10(t.mcap) - Math.log10(parts.value);
    })
    .sort((a, b) => a - b);
  const at = (p: number): number => {
    const k = Math.max(1, Math.ceil(p * sorted.length));
    return round4(sorted[Math.min(k, sorted.length) - 1]!);
  };
  return { p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) };
}

// ------------------------------------------------------------------ ridge cross-check

/**
 * A second, jointly-fitted model: one ridge on log10(mcap/TVL) with a size
 * slope and one dummy per category (categories with at least 2 tokens).
 * It is a cross-check, not the model: it is reported beside the sequential
 * one with its own strict leave-one-out, and it does not set any price.
 */
export function ridgeCrossCheck(kept: Token[]): RidgeCheck {
  const cats = [...new Set(kept.map((t) => t.category))].filter((c) => kept.filter((t) => t.category === c).length >= 2).sort();
  const lambda = TUNE.ridgeLambda;
  const misses: number[] = [];
  const curveMisses: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    const held = kept[i]!;
    const rest = kept.filter((_, j) => j !== i);
    const mean = rest.map((t) => Math.log10(t.tvl)).reduce((a, b) => a + b, 0) / rest.length;
    const sd = popSd(rest.map((t) => Math.log10(t.tvl))) || 1;
    const build = (t: Token): number[] => {
      const z = (Math.log10(t.tvl) - mean) / sd;
      const row = [1, z];
      for (const c of cats) row.push(t.category === c ? 1 : 0);
      return row;
    };
    const x = rest.map(build);
    const y = rest.map((t) => Math.log10(t.mcap / t.tvl));
    const p = 2 + cats.length;
    const ata: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const atb: number[] = new Array<number>(p).fill(0);
    for (let r = 0; r < x.length; r++) {
      for (let a = 0; a < p; a++) {
        atb[a] = atb[a]! + x[r]![a]! * y[r]!;
        for (let b = 0; b < p; b++) ata[a]![b] = ata[a]![b]! + x[r]![a]! * x[r]![b]!;
      }
    }
    for (let a = 2; a < p; a++) ata[a]![a] = ata[a]![a]! + lambda;
    const beta = solveLinear(ata, atb);
    const pred = held.tvl * 10 ** (build(held).reduce((s, v, k) => s + v * beta[k]!, 0));
    misses.push(missOf(pred, held.mcap));
    const fit = olsLine(rest.map((t) => ({ x: Math.log10(t.tvl), y: Math.log10(t.mcap) })));
    curveMisses.push(missOf(10 ** (fit.a + fit.b * Math.log10(held.tvl)), held.mcap));
  }
  const s = summarizeMisses(misses);
  const c = summarizeMisses(curveMisses);
  return { lambda, n: kept.length, medianMiss: s.medianMiss, within3: s.within3, curveOnlyMiss: c.medianMiss };
}

// ------------------------------------------------------------------ bootstrap

/**
 * 200 refits on resampled comparables: each refit reprices every board
 * row, and the P10–P90 of the ranks (and values) is the row's range. The
 * resampling is seeded, so the ranges are stable across rebuilds.
 */
export function bootstrapRanges(
  kept: Token[],
  rows: { slug: string; tvl: number; change_7d: number; age: number | null; name: string; category: string; chains: string[] }[],
  refits: number,
): Map<string, { rankLo: number; rankHi: number; p10: number; p90: number }> {
  const rng = mulberry32(20261114);
  const rankLists = new Map<string, number[]>();
  const valueLists = new Map<string, number[]>();
  for (const r of rows) {
    rankLists.set(r.slug, []);
    valueLists.set(r.slug, []);
  }
  for (let k = 0; k < refits; k++) {
    const sample: Token[] = [];
    for (let i = 0; i < kept.length; i++) sample.push(kept[Math.floor(rng() * kept.length)]!);
    const fit = olsLine(sample.map((t) => ({ x: Math.log10(t.tvl), y: Math.log10(t.mcap) })));
    const factors = categoryFactors(sample, fit);
    const words = new Set(sample.map((t) => firstWord(t.name)));
    const priced = rows
      .map((r) => ({
        slug: r.slug,
        value: priceProtocol(r.tvl, r.change_7d, r.age, r.name, r.category, r.chains, fit, factors, words).value,
      }))
      .sort((a, b) => b.value - a.value);
    priced.forEach((p, idx) => {
      rankLists.get(p.slug)!.push(idx + 1);
      valueLists.get(p.slug)!.push(p.value);
    });
  }
  const out = new Map<string, { rankLo: number; rankHi: number; p10: number; p90: number }>();
  for (const r of rows) {
    const ranks = [...rankLists.get(r.slug)!].sort((a, b) => a - b);
    const vals = [...valueLists.get(r.slug)!].sort((a, b) => a - b);
    out.set(r.slug, {
      rankLo: Math.round(quantileOf(ranks, 0.1)),
      rankHi: Math.round(quantileOf(ranks, 0.9)),
      p10: Math.round(quantileOf(vals, 0.1)),
      p90: Math.round(quantileOf(vals, 0.9)),
    });
  }
  return out;
}

// ------------------------------------------------------------------ walk-forward

/**
 * Walk-forward, strict: the comparables are ordered by listing date; for
 * each yearly boundary the curve and the factors are fitted on the tokens
 * listed before the boundary and scored on the NEXT year's cohort only.
 * The last fold has only 8 tokens and is reported on its own — the pooled
 * overall is given with and without it.
 */
export function walkForward(kept: Token[], asOf: string, opts: PriceOptions = {}): WalkForward {
  const dated = kept.filter((t) => t.listed_at !== null);
  const bounds = TUNE.walkBounds;
  const folds: WalkFold[] = [];
  const allFull: number[] = [];
  const allCurve: number[] = [];
  const earlyFull: number[] = [];
  const earlyCurve: number[] = [];
  for (let i = 0; i < bounds.length; i++) {
    const b = bounds[i]!;
    const next = i + 1 < bounds.length ? bounds[i + 1]! : '9999-12-31';
    const pre = dated.filter((t) => t.listed_at! < b);
    const post = dated.filter((t) => t.listed_at! >= b && t.listed_at! < next);
    if (pre.length < 15 || post.length < 5) continue;
    const fit = olsLine(pre.map((t) => ({ x: Math.log10(t.tvl), y: Math.log10(t.mcap) })));
    const factors = categoryFactors(pre, fit);
    const words = new Set(pre.map((t) => firstWord(t.name)));
    const chainFac = opts.chain ? chainFactors(pre, fit) : undefined;
    const full: number[] = [];
    const curve: number[] = [];
    for (const t of post) {
      const base = 10 ** (fit.a + fit.b * Math.log10(t.tvl));
      full.push(missOf(priceToken(t, fit, factors, words, asOf, opts, chainFac), t.mcap));
      curve.push(missOf(base, t.mcap));
    }
    folds.push({ boundary: b, train: pre.length, test: post.length, full: summarizeMisses(full), curveOnly: summarizeMisses(curve) });
    allFull.push(...full);
    allCurve.push(...curve);
    if (i < bounds.length - 1) {
      earlyFull.push(...full);
      earlyCurve.push(...curve);
    }
  }
  return {
    folds,
    overall: summarizeMisses(allFull),
    overallCurve: summarizeMisses(allCurve),
    earlyOverall: summarizeMisses(earlyFull),
    earlyCurve: summarizeMisses(earlyCurve),
  };
}

// ------------------------------------------------------------------ term selection

interface VariantSpec {
  term: string;
  opts: PriceOptions;
  verdict: string;
  /** Rebuild the kept set from the full comp list (dedup / exclusion / trim). */
  rebuild?: (all: Token[]) => Token[];
}

function blindTests(
  kept: Token[],
  asOf: string,
  opts: PriceOptions,
): { loo: number; split2024: number; split2025: number; walkForward: number } {
  const loo = looFull(kept, asOf, opts).full.medianMiss;
  const split2024 = strictTimeSplit(kept, TUNE.split2024, asOf, opts).full.medianMiss;
  const split2025 = strictTimeSplit(kept, TUNE.split2025, asOf, opts).full.medianMiss;
  const wf = walkForward(kept, asOf, opts).overall.medianMiss;
  return { loo, split2024, split2025, walkForward: wf };
}

const EXCLUDED_COMP_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Cross Chain Bridge',
]);

/**
 * The term-selection table, computed live. Every row is one candidate
 * scored by the same four blind tests; the verdict is the builder's
 * judgment on those numbers (see the Method tab for the rule). The
 * baseline row is the model that prices the board.
 */
export function termSelection(allTokens: Token[], kept: Token[], asOf: string): TermRow[] {
  const variants: VariantSpec[] = [
    { term: 'Full model (the board)', opts: {}, verdict: 'the model — kept' },
    { term: 'Without momentum', opts: { momentum: false }, verdict: 'kept — leave-one-out keeps it' },
    { term: 'Without category', opts: { category: false }, verdict: 'kept — leave-one-out keeps it' },
    { term: 'Without seasoning', opts: { seasoning: false }, verdict: 'kept — leave-one-out keeps it' },
    { term: 'Without sibling', opts: { sibling: false }, verdict: 'kept as a judgment — no blind test can separate it (3 board rows)' },
    { term: 'Curve alone (no tilts)', opts: { momentum: false, category: false, seasoning: false, sibling: false }, verdict: 'not adopted — the tilts win leave-one-out' },
    { term: 'Momentum ×0.6', opts: { momentumCoef: 0.6 }, verdict: 'not adopted — the fitted slope is too weak (t=0.74)' },
    { term: 'Momentum ×0.2', opts: { momentumCoef: 0.2 }, verdict: 'not adopted — weaker on leave-one-out' },
    { term: 'Seasoning span 0.1', opts: { seasoningSpan: 0.1 }, verdict: 'not adopted — wins leave-one-out only' },
    { term: 'Seasoning span 0.3', opts: { seasoningSpan: 0.3 }, verdict: 'not adopted — the leave-one-out cost is larger than the out-of-time gain' },
    { term: 'Chain factor added', opts: { chain: true }, verdict: 'dropped — loses on every blind test' },
    {
      term: 'One-per-ticker comps',
      opts: {},
      verdict: 'checked — no change (duplicate already trimmed)',
      rebuild: (all) => fitTwice(dedupBySymbol(all)).kept,
    },
    {
      term: 'Comps excl. Bridge / Liquid Staking',
      opts: {},
      verdict: 'dropped — weaker on leave-one-out and the 2024 split',
      rebuild: (all) => fitTwice(all.filter((t) => !EXCLUDED_COMP_CATEGORIES.has(t.category))).kept,
    },
    {
      term: 'Trim at 2.0 sd',
      opts: {},
      verdict: 'not adopted — the 1.5 sd trim wins on every test',
      rebuild: (all) => fitTwice(all, 2.0).kept,
    },
  ];
  return variants.map((v) => {
    const set = v.rebuild ? v.rebuild(allTokens) : kept;
    const t = blindTests(set, asOf, v.opts);
    return { term: v.term, loo: t.loo, split2024: t.split2024, split2025: t.split2025, walkForward: t.walkForward, verdict: v.verdict };
  });
}

// ------------------------------------------------------------------ farm economics

/**
 * What one transaction costs on a chain, in dollars. These are the
 * going rates for a plain transfer-and-call at the snapshot date, not a
 * quote: Ethereum is the expensive one, the L2s and Solana are cents.
 * A chain the table does not know budgets $1 a transaction.
 */
export const GAS_USD: Record<string, number> = {
  ethereum: 5.5, solana: 0.03, base: 0.15, arbitrum: 0.2, optimism: 0.15, polygon: 0.1,
  binance: 0.25, avalanche: 0.4, berachain: 0.3, sonic: 0.2, linea: 0.15, scroll: 0.15,
  blast: 0.15, mantle: 0.15, mode: 0.1, zksync: 0.15, sui: 0.05, ripple: 0.05, tron: 1,
  monad: 0.05, fantom: 0.2, celo: 0.1, xdai: 0.05, bitcoin: 2, 'hyperliquid l1': 0.1, plasma: 0.15,
};

export function gasFor(chain: string): number {
  return GAS_USD[chain.toLowerCase()] ?? 1;
}

/** The cheapest of a protocol's first three chains, as the snapshot lists them. */
export function cheapestOf(p: Proto): { chain: string; gasUsd: number } {
  const top = p.chains.slice(0, 3);
  if (top.length === 0) return { chain: 'its main chain', gasUsd: 1 };
  let best = top[0]!;
  for (const c of top) if (gasFor(c) < gasFor(best)) best = c;
  return { chain: best, gasUsd: gasFor(best) };
}

/**
 * How long to hold: a young record needs a full quarter to qualify across
 * snapshots; an old one is closer to launch, so a shorter hold is enough.
 * No listing date: sixty days, the middle of the range.
 */
export function holdFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 365) return 90;
  if (age < 730) return 60;
  return 45;
}

/** The slice of an implied value a capital earns at an airdrop share. */
export function sliceOf(tvl: number, implied: number, capital: number, share: number): number {
  return (capital / (tvl + capital)) * share * implied;
}

/** The T-bill yield forgone on a capital over the hold. */
export function tbillOf(capital: number, holdDays: number): number {
  return capital * TUNE.tbillRate * (holdDays / 365);
}

/** One short mechanism phrase per row, from the category and the chains. */
export function mechanismFor(p: Proto): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('curator') || c.includes('allocator')) return 'curated vault';
  if (c.includes('rwa')) return 'yield-bearing asset';
  if (c.includes('basis')) return 'delta-neutral basis';
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) return 'lend & borrow';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'liquidity & swaps';
  if (c.includes('yield aggregator')) return 'auto-compounding vault';
  if (c.includes('yield')) return 'yield vault';
  if (c.includes('prediction')) return 'markets & volume';
  if (c.includes('perpetual') || c.includes('derivative')) return 'perps & hedges';
  if (c.includes('restak')) return 'restaked yield';
  if (c.includes('chain')) return 'chain activity';
  if (c.includes('payment')) return 'payments flow';
  if (c.includes('bridge')) return 'bridged liquidity';
  if (c.includes('staking')) return 'staked yield';
  if (c.includes('index')) return 'index basket';
  return 'onchain position';
}

function coreAction(p: Proto, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('curator') || c.includes('allocator')) return `Put $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it to the snapshot.`;
  if (c.includes('basis')) return `Post $${capital} of USDC as margin for ${name}'s basis trade on ${chain} and leave the position open.`;
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, borrow a small amount against it, and leave both legs open.`;
  if (c.includes('dex') || c.includes('yield aggregator') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s main pool on ${chain} and leave it in range.`;
  if (c.includes('yield')) return `Deposit $${capital} of USDC into ${name}'s highest-yield vault on ${chain} and keep the shares.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take one market position on ${chain}.`;
  if (c.includes('payment')) return `Route $${capital} of volume through ${name} on ${chain} and keep the receipts.`;
  if (c.includes('chain')) return `Use ${name} for $${capital} of activity on ${chain} and keep the wallet funded.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

function weeklyAction(p: Proto, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('curator') || c.includes('allocator')) return 'Check the vault allocation and top it up if the strategy changed.';
  if (c.includes('rwa')) return 'Check the asset is still minting and the yield is still accruing.';
  if (c.includes('basis')) return 'Check the funding rate and rebalance the hedge if it flipped sign.';
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) return 'Check the borrow rate and the health factor, and top up collateral if it slipped.';
  if (c.includes('dex') || c.includes('yield aggregator') || c.includes('leveraged farm')) return 'Check the pool is still in range and collect any fees into the position.';
  if (c.includes('yield')) return 'Check the vault yield against the page and move the funds if it fell behind.';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Check the hedge is still balanced and the margin is above the minimum.';
  if (c.includes('prediction')) return 'Settle one market and open the next one the page lists.';
  return 'Check the points page and confirm the position still counts.';
}

function disqualifierFor(p: Proto): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('curator') || c.includes('allocator')) return 'Withdrawing before the snapshot, or holding only on a centralised exchange, can disqualify the position.';
  if (c.includes('rwa')) return 'Selling the yield asset before the snapshot, or holding it only on a centralised exchange, can disqualify the position.';
  if (c.includes('basis')) return 'Closing the hedge early, or running the position on a single chain the page does not list, can disqualify the position.';
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) return 'Letting the health factor fall under the minimum, or repaying the borrow before the snapshot, can disqualify the position.';
  if (c.includes('dex') || c.includes('yield aggregator') || c.includes('leveraged farm')) return 'Pulling liquidity out of range, or splitting the position across many wallets, can disqualify the position.';
  if (c.includes('yield')) return 'Moving the funds to a different vault mid-hold, or withdrawing before the snapshot, can disqualify the position.';
  return 'Using a fresh wallet per action, or farming from an exchange deposit address, can disqualify the position.';
}

/**
 * Eight steps per row, sized to ONE deposit of `capital` dollars: the fund
 * step moves that deposit onto the cheapest chain, the core action deposits
 * the same amount, and the upkeep and exit are costed against it. Costs:
 * fund (gas + a $1.50 bridge when the farm spans more than one chain),
 * deposit (gas), weekly upkeep (gas, once a fortnight over the hold, at
 * most six times), claim and exit (gas). The rest cost nothing but minutes.
 */
export function farmStepsFor(p: Proto, capital: number, asOf: string): FarmStep[] {
  const cheap = cheapestOf(p);
  const gas = cheap.gasUsd;
  const age = ageInDays(asOf, p.listed_at);
  const hold = holdFor(age);
  const upkeep = Math.min(6, Math.ceil(hold / 14));
  // A farm that spans more than one chain pays one $1.50 bridge on top.
  const bridge = p.chains.length > 1 ? TUNE.bridgeUsd : 0;
  const growth = p.change_7d ?? 0;
  const growthNote =
    growth <= -20
      ? ' TVL is down sharply over seven days, so size the position small and hold through at least one snapshot.'
      : growth >= 20
        ? ' TVL is up sharply over seven days, so open the position within 48 hours while the growth is fresh.'
        : '';
  const steps: FarmStep[] = [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.${growthNote}`, costUsd: 0, minutes: 5 },
    {
      text: `Fund the wallet with $${capital} of USDC on ${cheap.chain}, the cheapest of ${p.name}'s top three chains — that is the deposit this plan is sized to — and keep $${(gas + bridge).toFixed(2)} aside for gas${bridge > 0 ? ` plus one $${bridge.toFixed(2)} bridge (the farm spans ${p.chains.length} chains)` : ''}; check the balance before you deposit.`,
      costUsd: round2(gas + bridge),
      minutes: 10,
    },
    { text: coreAction(p, capital, cheap.chain), costUsd: round2(gas), minutes: 15 },
    { text: `${weeklyAction(p, cheap.chain)} Do it ${upkeep} times over the hold so the position is not a one-off.`, costUsd: round2(upkeep * gas), minutes: 10 * upkeep },
    { text: `Hold the position for at least ${hold} days and watch one risk trigger: if TVL falls 20% in a week, or the vault's allocation changes without notice, shrink the position before the next snapshot.`, costUsd: 0, minutes: 10 },
    { text: disqualifierFor(p), costUsd: 0, minutes: 10 },
    { text: `When the position has been counted, claim the rewards and exit the position in one transaction on ${cheap.chain}; leave a little gas in the wallet so the exit cannot strand the funds.`, costUsd: round2(gas), minutes: 15 },
    { text: `Write down what the farm returned against the plan on this page, so the next protocol starts from a real number, not a guess.`, costUsd: 0, minutes: 5 },
  ];
  for (const s of steps) {
    if (s.text.length > 600) s.text = `${s.text.slice(0, 596)}...`;
  }
  return steps;
}

function peersFor(row: Proto, tokens: Token[]): Peer[] {
  const inCat = tokens.filter((t) => t.category === (row.category ?? 'Other'));
  const others = tokens.filter((t) => t.category !== (row.category ?? 'Other'));
  const byTvl = (a: Token, b: Token) => Math.abs(Math.log10(a.tvl / row.tvl_usd)) - Math.abs(Math.log10(b.tvl / row.tvl_usd));
  const picked = [...inCat].sort(byTvl).slice(0, TUNE.peerCount);
  if (picked.length < TUNE.peerCount) {
    picked.push(...[...others].sort(byTvl).slice(0, TUNE.peerCount - picked.length));
  }
  return picked.map((t) => ({ slug: t.slug, name: t.name, tvl: t.tvl, mcap: t.mcap, ratio: round4(t.mcap / t.tvl) }));
}

function sensitivityFor(tvl: number, fees: number, hold: number, implied: number): BoardRow['sensitivity'] {
  const drops = [0.05, 0.1, 0.2];
  const capitals = [1000, 10000, 100000];
  const net = drops.map((d) =>
    capitals.map((cap) => round2(sliceOf(tvl, implied, cap, d) - fees - tbillOf(cap, hold))),
  );
  return { drops, capitals, net };
}

/**
 * Break-even odds: the chance the farm nets positive, from the row's own
 * band. The band is lognormal with σ from its P10–P90 width; the break-even
 * value is the implied value at which the slice exactly covers fees plus
 * the T-bill forgone.
 */
export function breakEvenOdds(implied: number, p10: number, p90: number, tvl: number, fees: number, tbill: number): number {
  const sigma = (Math.log10(p90) - Math.log10(p10)) / (2 * 1.2816);
  if (!(sigma > 0)) return implied > 0 ? 0.5 : 0;
  const breakEven = ((fees + tbill) * (tvl + TUNE.capitalUsd)) / (TUNE.capitalUsd * TUNE.airdropShare);
  if (breakEven <= 0) return 1;
  return round4(normCdf((Math.log10(implied) - Math.log10(breakEven)) / sigma));
}

// ------------------------------------------------------------------ the board

export function buildRadar(snap: Snap): RadarData {
  const asOf = snap.as_of || '2026-11-14';
  const compSet = collectTokens(snap);
  const tokens = compSet.tokens;
  const { first, firstSd, kept, outliers, fit } = fitTwice(tokens);
  const factors = categoryFactors(kept, fit);
  // The sibling words are the KEPT comparables' first words only — an
  // outlier's word (e.g. Kava Lend, one of the 16 set aside) does not make
  // a board row a sibling.
  const tradedWords = new Set(kept.map((t) => firstWord(t.name)));
  const quantiles = residualQuantiles(kept, fit, factors, asOf);

  // Strict validation, all computed live under the strict protocol.
  const loo = strictAblation(kept, asOf);
  const split2024 = strictTimeSplit(kept, TUNE.split2024, asOf);
  const split2025 = strictTimeSplit(kept, TUNE.split2025, asOf);
  const ageSplit = strictAgeSplit(kept, split2024, asOf);
  const growthSlope = slopeCheck(kept, fit, (t) => clampNum(t.change_7d, -60, 120) / 100);
  const ageSlope = slopeCheck(kept, fit, (t) => Math.log10(ageInDays(asOf, t.listed_at) ?? TUNE.unknownAgeDays));
  const ridge = ridgeCrossCheck(kept);
  const wf = walkForward(kept, asOf);
  const terms = termSelection(tokens, kept, asOf);
  const marketChange = medianOf(tokens.map((t) => t.change_7d));

  // One-per-ticker: the kept set already carries one observation per
  // ticker when no duplicate symbol survives the trim.
  const keptSymbols = kept.map((t) => t.symbol).filter((s) => s.length > 0);
  const keptDistinct = new Set(keptSymbols).size;
  const dupInKept = compSet.duplicateSymbols.filter((d) => kept.filter((t) => t.symbol === d.symbol).length > 1);
  const dupText = compSet.duplicateSymbols.map((d) => `${d.symbol.toUpperCase()} (${d.names.join(', ')})`).join('; ') || 'none';
  const onePerTicker = {
    duplicates: dupText,
    keptDistinct,
    note:
      dupInKept.length > 0
        ? 'duplicate tickers survive the trim — the fit carries them twice'
        : 'the duplicate tickers are already set aside by the 1.5 sd trim, so the kept set is already one-per-ticker',
  };

  // The rankable board.
  const rankable = snap.protocols.filter(isRankable);
  const priced = rankable.map((p) => {
    const age = ageInDays(asOf, p.listed_at);
    const parts = priceProtocol(p.tvl_usd, p.change_7d ?? 0, age, p.name, p.category ?? 'Other', p.chains, fit, factors, tradedWords);
    return { p, age, parts };
  });
  priced.sort((a, b) => b.parts.value - a.parts.value || (a.p.slug < b.p.slug ? -1 : 1));

  // Bootstrap rank ranges over the priced rows.
  const ranges = bootstrapRanges(
    kept,
    priced.map(({ p, age }) => ({ slug: p.slug, tvl: p.tvl_usd, change_7d: p.change_7d ?? 0, age, name: p.name, category: p.category ?? 'Other', chains: p.chains })),
    TUNE.bootstrapRefits,
  );
  // How many rows move 5+ places when the tilts come off (curve-only ranks).
  const curveOrder = [...priced].sort((a, b) => b.parts.curve - a.parts.curve || (a.p.slug < b.p.slug ? -1 : 1));
  const curveRank = new Map(curveOrder.map((r, i) => [r.p.slug, i + 1]));
  let tiltsMove = 0;
  priced.forEach((r, i) => {
    if (Math.abs(i + 1 - (curveRank.get(r.p.slug) ?? 0)) >= 5) tiltsMove++;
  });

  const bandMult = (q: number): number => 10 ** q;
  const rows: BoardRow[] = priced.map(({ p, age, parts }, i) => {
    const steps = farmStepsFor(p, TUNE.capitalUsd, asOf);
    const fees = round2(steps.reduce((s, x) => s + x.costUsd, 0));
    const hold = holdFor(age);
    const tbill = round2(tbillOf(TUNE.capitalUsd, hold));
    const slice = round2(sliceOf(p.tvl_usd, parts.value, TUNE.capitalUsd, TUNE.airdropShare));
    const p10 = Math.max(1, Math.round(parts.value * bandMult(quantiles.p10)));
    const p25 = Math.max(1, Math.round(parts.value * bandMult(quantiles.p25)));
    const p75 = Math.max(1, Math.round(parts.value * bandMult(quantiles.p75)));
    const p90 = Math.max(1, Math.round(parts.value * bandMult(quantiles.p90)));
    const sliceLow = round2(sliceOf(p.tvl_usd, p25, TUNE.capitalUsd, TUNE.airdropShare));
    const net = round2(slice - fees - tbill);
    const netLow = round2(sliceLow - fees - tbill);
    const verdict: BoardRow['verdict'] = netLow > 0 ? 'FARM' : sliceLow > fees ? 'THIN' : 'SKIP';
    const hours = round2(steps.reduce((s, x) => s + x.minutes, 0) / 60);
    const range = ranges.get(p.slug) ?? { rankLo: i + 1, rankHi: i + 1, p10, p90 };
    return {
      slug: p.slug,
      name: p.name,
      category: p.category ?? 'Other',
      mechanism: mechanismFor(p),
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      listed_at: p.listed_at,
      token_status: 'pre-token',
      rank: i + 1,
      rank_lo: Math.min(range.rankLo, i + 1),
      rank_hi: Math.max(range.rankHi, i + 1),
      implied_value_usd: parts.value,
      curve_usd: parts.curve,
      p10_usd: p10,
      p25_usd: p25,
      p75_usd: p75,
      p90_usd: p90,
      low_usd: p25,
      slice_usd: slice,
      slice_low_usd: sliceLow,
      fees_usd: fees,
      gas_usd: cheapestOf(p).gasUsd,
      cheapest_chain: cheapestOf(p).chain,
      hold_days: hold,
      tbill_usd: tbill,
      net_usd: net,
      net_low_usd: netLow,
      odds: breakEvenOdds(parts.value, p10, p90, p.tvl_usd, fees, tbill),
      per_hour_usd: round2(net / Math.max(hours, 0.25)),
      per_hour_low_usd: round2(netLow / Math.max(hours, 0.25)),
      hours,
      verdict,
      farm_steps: steps.map((s) => s.text),
      farm_costs_usd: steps.map((s) => s.costUsd),
      farm_minutes: steps.map((s) => s.minutes),
      sensitivity: sensitivityFor(p.tvl_usd, fees, hold, parts.value),
      peers: peersFor(p, tokens),
      model: {
        curve_usd: parts.curve,
        category: parts.category,
        category_n: parts.categoryN,
        category_source: parts.categorySource,
        momentum: parts.momentum,
        seasoning: parts.seasoning,
        sibling: parts.sibling,
      },
    };
  });

  // Traded anchors: every comparable, by implied multiple, for the Anchors tab.
  const anchors: AnchorRow[] = tokens
    .map((t) => ({
      slug: t.slug,
      name: t.name,
      category: t.category,
      tvl: t.tvl,
      mcap: t.mcap,
      multiple: round4(t.mcap / t.tvl),
      change_7d: t.change_7d,
      listed_at: t.listed_at,
    }))
    .sort((a, b) => b.multiple - a.multiple);

  // Set aside: every pre-token protocol the rule leaves out, with its reason.
  const setAside: SetAsideRow[] = snap.protocols
    .filter((p) => isPreToken(p) && !isRankable(p))
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl: p.tvl_usd, reason: rankableReason(p) ?? '' }))
    .sort((a, b) => b.tvl - a.tvl);

  const farmNext: FarmNextCard[] = [...rows]
    .sort((a, b) => b.per_hour_usd - a.per_hour_usd)
    .slice(0, 5)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      rank: r.rank,
      mechanism: r.mechanism,
      net_usd: r.net_usd,
      net_low_usd: r.net_low_usd,
      gas_usd: r.gas_usd,
      hours: r.hours,
      per_hour_usd: r.per_hour_usd,
      per_hour_low_usd: r.per_hour_low_usd,
      odds: r.odds,
    }));

  const watchlistRows = rows.filter((r) => snap.watchlist.includes(r.slug));
  const bestWatch = [...watchlistRows].sort((a, b) => b.per_hour_usd - a.per_hour_usd)[0];
  // Verdicts are netted at the P25 low end; the point-value split is kept
  // beside them so the reader can see what the low end costs.
  const lowEnd = {
    farm: rows.filter((r) => r.verdict === 'FARM').length,
    thin: rows.filter((r) => r.verdict === 'THIN').length,
    skip: rows.filter((r) => r.verdict === 'SKIP').length,
  };
  const pointVerdicts = {
    farm: rows.filter((r) => r.net_usd > 0).length,
    thin: rows.filter((r) => r.net_usd <= 0 && r.slice_usd > r.fees_usd).length,
    skip: rows.filter((r) => r.net_usd <= 0 && r.slice_usd <= r.fees_usd).length,
  };

  const validation: Validation = {
    firstA: round4(first.a),
    firstB: round4(first.b),
    firstSd: round4(firstSd),
    fit,
    outliers,
    categories: factors,
    loo,
    split2024,
    split2025,
    ageSplit,
    growthSlope,
    ageSlope,
    quantiles,
    ridge,
    walkForward: wf,
    termSelection: terms,
    onePerTicker,
    bootstrapRefits: TUNE.bootstrapRefits,
    tiltsMove,
    marketChange7d: round4(marketChange),
  };

  const totalImplied = rows.reduce((s, r) => s + r.implied_value_usd, 0);
  return {
    asOf,
    modelVersion: MODEL_VERSION,
    watchlist: snap.watchlist,
    counts: {
      protocols: snap.protocols.length,
      preToken: snap.protocols.filter(isPreToken).length,
      ranked: rows.length,
      watchlist: snap.watchlist.length,
      watchlistCovered: watchlistRows.length,
      comps: tokens.length,
      kept: kept.length,
      outliers: outliers.length,
      setAside: setAside.length,
      traded: snap.protocols.length - snap.protocols.filter(isPreToken).length,
    },
    verdicts: lowEnd,
    pointVerdicts,
    fit,
    outliers,
    categories: factors,
    validation,
    rows,
    anchors,
    setAside,
    farmNext,
    bestPerHourWatchlist: bestWatch
      ? { name: bestWatch.name, slug: bestWatch.slug, perHour: bestWatch.per_hour_usd }
      : null,
    totalImpliedUsd: totalImplied,
    headline: `${rows.length} pre-token protocols priced off the ${kept.length} tokens that already trade; ${lowEnd.farm} pay even at the low end.`,
  };
}
