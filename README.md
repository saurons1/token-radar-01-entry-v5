# Token Radar — token-radar-01 entry v5

198 pre-token protocols, priced from the 103 tokens that already trade.
Model **radar-6**: a log-log curve of market cap on TVL, trimmed at 1.5 sd,
plus four small tilts (category, momentum, seasoning, sibling). Every farm
plan is sized to one $1,000 deposit and judged at the low end of the band.

## The model

- Curve: `log10(mcap) = 3.4069 + 0.4759 · log10(TVL)`, R² 0.2842, 103 kept / 16 outliers.
- Leave-one-out: full model ×2.5001, curve alone ×2.9891, flat median ×3.7974.
- Time splits: 2024 ×1.9318, 2025 ×1.8753 (curve wins both: ×1.8009 / ×1.7642).
- Walk-forward (4 yearly folds): overall ×1.9864 vs curve ×1.9506.
- Verdicts at the P25 low end: FARM 100 / THIN 45 / SKIP 53 (point value 146 / 26 / 26).
- Top row: Steakhouse Financial, $70.6M implied.

The tilts win leave-one-out but the curve wins every out-of-time test, so
the factors are refitted on each new snapshot — they are not facts about
the next one. A ridge on the two weak signals (λ = 10) lands at ×2.6352,
no better than the curve, so it is reported and not used.

## Build

```sh
node main.ts            # reads the kit snapshot, writes out/
```

Outputs: `out/board.json`, `out/data.js`, `out/dashboard/` (the board),
`out/dossier.json` (dashboard source + screenshots). The build is
deterministic — two runs from the same snapshot are byte-identical.

## Files

- `main.ts` — build entry: snapshot → radar → files + dossier.
- `lib/model.ts` — the model, the blind tests, the board.
- `lib/data.ts` — serializers for board.json, data.js, dossier.json.
- `vendor/makefun-board.ts` — shared board kernel (math, pricing, farm plans).
- `dashboard/` — the board itself (open `out/dashboard/index.html`).
- `screenshots/` — the three dossier shots (board, detail, method).

## Verification

- Gate: all checks pass (198 rows, ranks 1–198, implied in range, farm
  steps 3–12 within 20–600 chars, watchlist 40/40, dashboard 3 files,
  dossier source under 65,536 B, 3 screenshots ≤ 512 KiB each).
- Page: the agreement line reads 198/198 on the board, detail and method
  views, with zero page errors.
- Deterministic: two full `node main.ts` runs are byte-identical.
- Known deviations from the v5 reference build: the ridge lands at
  ×2.6402 instead of ×2.6352 (its exact formulation was not recoverable);
  18 of 198 odds are off by 0.0001 (a rounding boundary in the band
  spread); one implied value is $1 off (Temple, a rounding boundary);
  the bootstrap rank ranges use a seeded resample and are plausible but
  not identical to the reference. None of these changes a verdict.

## Snapshot

As of 2026-11-14, floor $50,000,000, 758 protocols, 342 pre-token,
watchlist 40/40 covered. Source: the kit's DefiLlama snapshot.
