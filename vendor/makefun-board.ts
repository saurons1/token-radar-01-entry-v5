// Shared board kernel for the token launch radar.
// Pure helpers only: no file reads, no network, no randomness outside the
// seeded bootstrap in the model. Everything here is deterministic, so two
// builds from the same snapshot produce byte-identical output.
//
// The model ("radar-6") prices a pre-token protocol from the tokens that
// already trade: a log-log curve of market cap on TVL, then four small
// tilts (category, momentum, seasoning, sibling). A farm plan is sized to
// one $1,000 deposit and judged at the low end of the value band.

export type Proto = {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
};

export type Comp = {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl: number;
  mcap: number;
  ch: number;
  listed: string | null;
  symbol: string;
};

export type FactorInfo = { factor: number; n: number; medianResidual: number };

export type RowModel = {
  curve_usd: number;
  category: number;
  category_n: number;
  category_source: string;
  momentum: number;
  seasoning: number;
  sibling: number;
};

export type Peer = { slug: string; name: string; tvl: number; mcap: number; ratio: number };

export type Sensitivity = { drops: number[]; capitals: number[]; net: number[][] };

export type BoardRow = {
  slug: string;
  name: string;
  category: string;
  mechanism: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  token_status: string;
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
  verdict: string;
  farm_steps: string[];
  farm_costs_usd: number[];
  farm_minutes: number[];
  sensitivity: Sensitivity;
  peers: Peer[];
  model: RowModel;
};

export type BlindSummary = { n: number; medianMiss: number; within3: number; within10: number };

export type Outlier = { name: string; slug: string; residual: number };

export type Anchor = {
  slug: string;
  name: string;
  category: string;
  tvl: number;
  mcap: number;
  multiple: number;
  change_7d: number | null;
  listed_at: string | null;
};

export type SetAside = { slug: string; name: string; category: string; tvl: number; reason: string };

export const MODEL_VERSION = "radar-6";
export const DEPOSIT = 1000;
export const CAPTURE = 0.1;
export const TBILL_RATE = 0.04;
export const BRIDGE_FEE = 1.5;
export const Z90 = 1.2815515655446004;
export const TRIM_SD = 1.5;
export const SEASON_CAP = 1095;
export const NULL_AGE_DAYS = 365;

// Gas to move once on a chain, in dollars. Anything not listed here costs
// $1.00 — the default below. The table is small on purpose: only chains
// that ever win the cheapest-of-three race need an entry.
export const GAS_USD: Record<string, number> = {
  Algorand: 1, Aptos: 1, Arbitrum: 0.2, Arc: 1, Avalanche: 0.4, BSquared: 1,
  Base: 0.15, Berachain: 0.3, Binance: 0.25, Bitcoin: 2, Bittensor: 1,
  Blast: 0.15, CORE: 1, Canton: 1, Celo: 0.1, Ethereum: 5.5, Flare: 1,
  Fluent: 1, Hemi: 1, "Hyperliquid L1": 0.1, Ink: 1, Kava: 1, Klaytn: 1,
  Linea: 0.15, Manta: 1, Mantle: 0.15, Mezo: 1, Monad: 0.05, Noble: 1,
  Optimism: 0.15, Plasma: 0.15, Polygon: 0.1, Proton: 1, Provenance: 1,
  Qubic: 1, RISE: 1, RSK: 1, "Reya Network": 1, Ripple: 0.05,
  "Robinhood Chain": 1, Ronin: 1, Solana: 0.03, Sonic: 0.2, Sophon: 1,
  Stacks: 1, Starknet: 1, Stellar: 1, Strato: 1, Sui: 0.05, Tempo: 1,
  "World Chain": 1, XION: 1, "zkSync Era": 1,
};

export function gasFor(chain: string): number {
  const v = GAS_USD[chain];
  return v === undefined ? 1 : v;
}

// How a protocol earns the token it has not launched yet, by category.
export const MECHANISM: Record<string, string> = {
  "Risk Curators": "curated vault",
  "Onchain Capital Allocator": "curated vault",
  Dexs: "liquidity & swaps",
  Indexes: "liquidity & swaps",
  "Leveraged Farming": "liquidity & swaps",
  Lending: "lend & borrow",
  CDP: "lend & borrow",
  "CDP Manager": "lend & borrow",
  "Collateral Markets": "lend & borrow",
  "Uncollateralized Lending": "lend & borrow",
  RWA: "yield-bearing asset",
  Yield: "yield vault",
  Derivatives: "perps & hedges",
  "Interest Rate Derivatives": "perps & hedges",
  "Basis Trading": "delta-neutral basis",
  "Yield Aggregator": "auto-compounding vault",
  Chain: "chain activity",
  "Cross Chain Bridge": "chain activity",
  Restaking: "restaked yield",
  "Staking Pool": "staked yield",
  Payments: "payments flow",
  "Prediction Market": "markets & volume",
};

export function mechanismFor(category: string): string {
  return MECHANISM[category] ?? "onchain position";
}

// Categories that are not a launch at all, however large their TVL.
export const NOT_A_LAUNCH = new Set([
  "Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX",
]);

export const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
export const WRAPPED_WORDS = ["wrapped", "staked", "staking"];
export const EXCHANGE_NAMES = ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"];

// ---- small math -------------------------------------------------------

export function roundDp(x: number, dp: number): number {
  const m = 10 ** dp;
  return Math.round(x * m) / m;
}
export const round1 = (x: number): number => roundDp(x, 1);
export const round2 = (x: number): number => roundDp(x, 2);
export const round4 = (x: number): number => roundDp(x, 4);

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function medianOf(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Nearest-rank quantile: the value at position ceil(p*n), 1-based.
export function quantile1(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const idx = Math.max(1, Math.ceil(p * n)) - 1;
  return sortedAsc[Math.min(idx, n - 1)];
}

export function ols(points: Array<[number, number]>): { a: number; b: number } {
  const n = points.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of points) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const den = n * sxx - sx * sx;
  const b = den === 0 ? 0 : (n * sxy - sx * sy) / den;
  return { a: (sy - b * sx) / n, b };
}

export function sampleSd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
}

// Abramowitz-Stegun 7.1.26; |error| < 1.5e-7, plenty for a 4dp odds field.
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-ax * ax));
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function missRatio(pred: number, act: number): number {
  return Math.max(pred / act, act / pred);
}

export function summarizeMisses(misses: number[]): BlindSummary {
  const ms = [...misses].sort((a, b) => a - b);
  const n = ms.length;
  return {
    n,
    medianMiss: round4(medianOf(ms)),
    within3: round4(ms.filter((m) => m <= 3).length / Math.max(1, n)),
    within10: round4(ms.filter((m) => m <= 10).length / Math.max(1, n)),
  };
}

// ---- snapshot helpers -------------------------------------------------

export function ageDays(asOf: string, listed: string | null): number | null {
  if (!listed) return null;
  const a = Date.parse(asOf + "T00:00:00Z");
  const b = Date.parse(listed + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((a - b) / 86400000));
}

export function firstWord(name: string): string {
  const w = (name || "").trim().split(/\s+/);
  return w.length > 0 && w[0] ? w[0].toLowerCase() : "";
}

export function isPreToken(p: Proto): boolean {
  return !p.gecko_id && !p.symbol;
}

// ---- pricing ----------------------------------------------------------

export function momentumFactor(ch: number, coef = 0.4): number {
  return 1 + coef * (clamp(ch, -60, 120) / 100);
}

export function seasoningFactor(age: number | null, base = 0.8, span = 0.2): number {
  const d = age === null ? NULL_AGE_DAYS : age;
  return base + span * (Math.min(d, SEASON_CAP) / SEASON_CAP);
}

export function curveValue(a: number, b: number, tvl: number): number {
  return 10 ** (a + b * Math.log10(tvl));
}

export function categoryFactors(
  comps: Comp[], fit: { a: number; b: number },
): Map<string, FactorInfo> {
  const by = new Map<string, number[]>();
  for (const t of comps) {
    const r = Math.log10(t.mcap) - (fit.a + fit.b * Math.log10(t.tvl));
    const arr = by.get(t.category) ?? [];
    arr.push(r);
    by.set(t.category, arr);
  }
  const out = new Map<string, FactorInfo>();
  for (const [cat, rs] of by) {
    const med = medianOf(rs);
    const n = rs.length;
    out.set(cat, {
      factor: n < 3 ? 1 : 10 ** (med * (n / (n + 4))),
      n,
      medianResidual: med,
    });
  }
  return out;
}

export type PriceOpts = {
  category?: boolean;
  momentum?: boolean;
  momCoef?: number;
  seasoning?: boolean;
  seaSpan?: number;
  sibling?: boolean;
  sibMult?: number;
  chain?: boolean;
  chainFactors?: Map<string, FactorInfo>;
  flat?: boolean;
  rounded?: boolean;
};

export function priceComp(
  t: Comp, fit: { a: number; b: number }, factors: Map<string, FactorInfo>,
  words: Set<string>, opts: PriceOpts, asOf: string,
): number {
  const base = curveValue(fit.a, fit.b, t.tvl);
  const cat = opts.category === false ? 1 : (factors.get(t.category)?.factor ?? 1);
  let v = base * cat;
  if (opts.momentum !== false) v *= momentumFactor(t.ch, opts.momCoef ?? 0.4);
  if (opts.seasoning !== false) {
    v *= seasoningFactor(ageDays(asOf, t.listed), 0.8, opts.seaSpan ?? 0.2);
  }
  if (opts.sibling !== false && words.has(firstWord(t.name))) v *= opts.sibMult ?? 0.5;
  if (opts.chain) {
    const ch0 = t.chains.length > 0 ? t.chains[0] : "none";
    v *= opts.chainFactors?.get(ch0)?.factor ?? 1;
  }
  return Math.max(1, v);
}

export function chainFactors(
  comps: Comp[], fit: { a: number; b: number }, minN = 3,
): Map<string, FactorInfo> {
  const by = new Map<string, number[]>();
  for (const t of comps) {
    const ch = t.chains.length > 0 ? t.chains[0] : "none";
    const r = Math.log10(t.mcap) - (fit.a + fit.b * Math.log10(t.tvl));
    const arr = by.get(ch) ?? [];
    arr.push(r);
    by.set(ch, arr);
  }
  const out = new Map<string, FactorInfo>();
  for (const [ch, rs] of by) {
    const med = medianOf(rs);
    const n = rs.length;
    out.set(ch, { factor: n < minN ? 1 : 10 ** (med * (n / (n + 4))), n, medianResidual: med });
  }
  return out;
}

export function categorySource(n: number): string {
  if (n === 0) return "no traded token here — the curve stands alone";
  if (n === 1) return "just 1 traded token — too few to shift the curve";
  if (n === 2) return "just 2 traded tokens — too few to shift the curve";
  return `${n} traded tokens, median residual scaled ${n}/${n + 4}`;
}

// ---- farm -------------------------------------------------------------

export function cheapestOf(chains: string[]): { chain: string; gas: number } {
  let best = chains.length > 0 ? chains[0] : "";
  let bestGas = gasFor(best);
  for (const c of chains.slice(0, 3)) {
    const g = gasFor(c);
    if (g < bestGas) { best = c; bestGas = g; }
  }
  return { chain: best, gas: bestGas };
}

export function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 365) return 90;
  if (age < 730) return 60;
  return 45;
}

export function checkCountFor(hold: number): number {
  return hold === 45 ? 4 : hold === 60 ? 5 : 6;
}

export function farmMinutesFor(hold: number): number[] {
  const k = checkCountFor(hold);
  return [5, 10, 15, k * 10, 10, 10, 15, 5];
}

export function farmCostsFor(gas: number, multiChain: boolean, hold: number): number[] {
  const k = checkCountFor(hold);
  const step2 = round2(gas + (multiChain ? BRIDGE_FEE : 0));
  return [0, step2, gas, round2(gas * k), 0, 0, gas, 0];
}

export function tbillFor(capital: number, hold: number): number {
  return round2((capital * TBILL_RATE * hold) / 365);
}

export function sliceFor(capital: number, tvl: number, value: number): number {
  return round2((capital / (tvl + capital)) * CAPTURE * value);
}

export function oddsFor(implied: number, p10: number, p90: number, fees: number, tbill: number, tvl: number): number {
  const sigma = (Math.log(p90) - Math.log(p10)) / (2 * Z90);
  const be = ((fees + tbill) * (tvl + DEPOSIT)) / (DEPOSIT * CAPTURE);
  return round4(normalCdf((Math.log(implied) - Math.log(be)) / sigma));
}

export function sensitivityFor(
  implied: number, tvl: number, fees: number, hold: number,
): Sensitivity {
  const drops = [0.05, 0.1, 0.2];
  const capitals = [1000, 10000, 100000];
  // The grid is built from the exact slice and T-bill, not the rounded
  // stored values — rounding first would push a cent the wrong way on
  // rows that sit on a boundary.
  const net = drops.map((d) =>
    capitals.map((c) => {
      const sExact = (c / (tvl + c)) * CAPTURE * implied;
      const tbExact = (c * TBILL_RATE * hold) / 365;
      return round2(sExact * (d / CAPTURE) - fees - tbExact);
    }),
  );
  return { drops, capitals, net };
}

export function verdictFor(netLow: number, sliceLow: number, fees: number): string {
  if (netLow > 0) return "FARM";
  if (sliceLow > fees) return "THIN";
  return "SKIP";
}

export function nearestPeers(row: { category: string; tvl_usd: number }, pool: Comp[]): Peer[] {
  const tvl = row.tvl_usd;
  const dist = (t: Comp): number => Math.abs(Math.log10(t.tvl) - Math.log10(tvl));
  const same = pool.filter((t) => t.category === row.category).sort((x, y) => dist(x) - dist(y));
  const other = pool.filter((t) => t.category !== row.category).sort((x, y) => dist(x) - dist(y));
  return [...same, ...other].slice(0, 4).map((t) => ({
    slug: t.slug, name: t.name, tvl: t.tvl, mcap: t.mcap, ratio: round4(t.mcap / t.tvl),
  }));
}

// ---- farm plan wording ------------------------------------------------
// Eight steps, sized to one $1,000 deposit. The action, the check and the
// disqualifier change with the mechanism; the rest is the same every time.

export type StepCtx = {
  name: string;
  chain: string;
  hold: number;
  checks: number;
  step2Cost: number;
  multiChain: boolean;
  chainCount: number;
  change7d: number | null;
};

function money(x: number): string {
  return `$${x.toFixed(2)}`;
}

function stepOne(ctx: StepCtx): string {
  let s = "Open a new wallet just for this farm, fund it only with the money for this position, and store its seed phrase offline.";
  if (ctx.change7d !== null && ctx.change7d >= 20) {
    s += " TVL jumped sharply in the last seven days, so get in within 48 hours while the move is still fresh.";
  } else if (ctx.change7d !== null && ctx.change7d <= -20) {
    s += " TVL fell sharply in the last seven days, so keep the position small and stay in through at least one snapshot.";
  }
  return s;
}

function stepTwo(ctx: StepCtx): string {
  let s = `Send $1000 of USDC to the wallet on ${ctx.chain}, the cheapest of ${ctx.name}'s first three chains — the deposit this plan is sized for — and hold back ${money(ctx.step2Cost)} for gas`;
  if (ctx.multiChain) s += ` and one $1.50 bridge (the farm spans ${ctx.chainCount} chains)`;
  return s + "; check the balance before depositing.";
}

const STEP_ACTION: Record<string, (c: StepCtx) => string> = {
  "curated vault": (c) => `Deposit $1000 of USDC into a ${c.name} vault on ${c.chain} and hold on to the vault shares.`,
  "liquidity & swaps": (c) => `Put $1000 of liquidity into ${c.name}'s main pool on ${c.chain} and keep it in range.`,
  "auto-compounding vault": (c) => `Put $1000 of liquidity into ${c.name}'s main pool on ${c.chain} and keep it in range.`,
  "lend & borrow": (c) => `Lend $1000 of USDC on ${c.name} (${c.chain}), borrow a little against it, and leave both sides open.`,
  "yield-bearing asset": (c) => `Mint $1000 of ${c.name}'s yield-bearing asset on ${c.chain} and hold it until the snapshot.`,
  "yield vault": (c) => `Place $1000 of USDC in ${c.name}'s highest-yield vault on ${c.chain} and keep the shares.`,
  "delta-neutral basis": (c) => `Put up $1000 of USDC as margin for ${c.name}'s basis trade on ${c.chain} and leave it open.`,
  "perps & hedges": (c) => `Put up $1000 of USDC as margin on ${c.name} and open a single small hedged position.`,
  "chain activity": (c) => `Run $1000 of activity through ${c.name} on ${c.chain} and keep the wallet topped up.`,
  "markets & volume": (c) => `Put $1000 into ${c.name} and open one market position on ${c.chain}.`,
  "onchain position": (c) => `Move $1000 of USDC into ${c.name} on ${c.chain} and leave the position open.`,
  "restaked yield": (c) => `Move $1000 of USDC into ${c.name} on ${c.chain} and leave the position open.`,
  "staked yield": (c) => `Move $1000 of USDC into ${c.name} on ${c.chain} and leave the position open.`,
  "payments flow": (c) => `Push $1000 of volume through ${c.name} on ${c.chain} and save the receipts.`,
};

const STEP_CHECK: Record<string, (c: StepCtx) => string> = {
  "curated vault": (c) => `Review the vault allocation and add funds if the strategy moved. Repeat this ${c.checks} times across the hold so the position is not a one-off.`,
  "liquidity & swaps": (c) => `Confirm the pool is still in range and fold any fees back into the position. Repeat this ${c.checks} times across the hold so the position is not a one-off.`,
  "auto-compounding vault": (c) => `Confirm the pool is still in range and fold any fees back into the position. Repeat this ${c.checks} times across the hold so the position is not a one-off.`,
  "lend & borrow": (c) => `Watch the borrow rate and the health factor, and add collateral if either slipped. Repeat this ${c.checks} times across the hold so the position is not a one-off.`,
  "yield-bearing asset": (c) => `Confirm the asset is still minting and the yield keeps accruing. Repeat this ${c.checks} times across the hold so the position is not a one-off.`,
  "yield vault": (c) => `Compare the vault yield with the page and shift the funds if it fell behind. Repeat this ${c.checks} times across the hold so the position is not a one-off.`,
  "delta-neutral basis": (c) => `Watch the funding rate and rebalance the hedge if it changes sign. Repeat this ${c.checks} times across the hold so the position is not a one-off.`,
  "perps & hedges": (c) => `Make sure the hedge is still balanced and the margin stays above the minimum. Repeat this ${c.checks} times across the hold so the position is not a one-off.`,
};

function stepCheck(ctx: StepCtx, mechanism: string): string {
  const fn = STEP_CHECK[mechanism];
  if (fn) return fn(ctx);
  return `Look at the points page and make sure the position still counts. Repeat this ${ctx.checks} times across the hold so the position is not a one-off.`;
}

const STEP_RISK: Record<string, string> = {
  "curated vault": "Pulling out before the snapshot, or holding only on a centralised exchange, can disqualify it.",
  "liquidity & swaps": "Taking liquidity out of range, or spreading the position over many wallets, can disqualify it.",
  "auto-compounding vault": "Taking liquidity out of range, or spreading the position over many wallets, can disqualify it.",
  "lend & borrow": "Letting the health factor drop below the minimum, or repaying the borrow before the snapshot, can disqualify it.",
  "yield-bearing asset": "Selling the yield asset before the snapshot, or keeping it only on a centralised exchange, can disqualify it.",
  "yield vault": "Shifting the funds to another vault mid-hold, or pulling out before the snapshot, can disqualify it.",
  "delta-neutral basis": "Closing the hedge early, or running it on a chain the page does not list, can disqualify it.",
};

function stepRisk(mechanism: string): string {
  return STEP_RISK[mechanism] ?? "A new wallet for every action, or farming from an exchange deposit address, can disqualify it.";
}

export function farmStepsFor(ctx: StepCtx, mechanism: string): string[] {
  const action = STEP_ACTION[mechanism] ?? STEP_ACTION["onchain position"];
  return [
    stepOne(ctx),
    stepTwo(ctx),
    action(ctx),
    stepCheck(ctx, mechanism),
    `Keep the position for at least ${ctx.hold} days and watch one warning sign: if TVL drops 20% in a week, or the vault's allocation shifts without notice, cut the position before the next snapshot.`,
    stepRisk(mechanism),
    `Once the position has been counted, claim the rewards and close out in a single transaction on ${ctx.chain}; leave a bit of gas in the wallet so the exit cannot strand the funds.`,
    "Note down what the farm actually returned against this plan, so the next protocol starts from a real number, not a guess.",
  ];
}

// ---- seeded rng (bootstrap only; the anchor round is the seed) ---------

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
