# Token Radar

[![make.fun](https://make.fun/badge/competition/token-radar-01/submitted)](https://make.fun/bounty/token-radar-01) [![make.fun](https://make.fun/badge/competition/token-radar-01/leaderboard)](https://make.fun/bounty/token-radar-01) [![make.fun](https://make.fun/badge/competition/token-radar-01/deadline)](https://make.fun/bounty/token-radar-01)

Which launch is worth farming next? A value model for pre-token protocols, with a costed farm plan for each.

## What it does

The board ranks 198 pre-token protocols by an implied value that follows from the snapshot's own figures — TVL, 7-day growth, how long the protocol has run with no token — never a hardcoded name list:

- a size curve, `log10 value = 3.4069 + 0.4759 × log10(TVL)`, fitted on 103 traded tokens (R² 0.2842), with a 1.5 sd outlier trim;
- category factors: the shrunk median residual of each category's traded tokens;
- growth that carries TVL two weeks at its 7-day rate, seasoning up to 3 years, and a sibling half-value when a traded token shares the first word.

Every row carries a P10–P90 band and a bootstrap rank range from 200 refits. Every row carries a farm plan sized to one $1,000 deposit: 8 costed steps, fees from a per-chain gas table, a $1.50 bridge where a farm spans chains, the T-bill forgone over the hold, and a verdict (FARM / THIN / SKIP) netted at the P25 low end, not the point value.

## How it is validated

- Leave-one-out, refitted without the tested token: median miss ×2.50 against ×2.99 for the curve alone and ×3.80 for one flat multiple; 53% land within 3×.
- Walk-forward, fitted on the tokens listed before each year and scored on the next year's cohort: overall ×1.99 against ×1.95 for the curve alone. The walk-forward disagrees with leave-one-out, and the Method tab says so: category multiples drift, so factors must be refitted on each new snapshot.
- Term selection: every term was kept or dropped on the same four blind tests — the blind tests keep the momentum, category, seasoning and sibling layers, and reject the chain factor, a two-segment curve and a 0.6 momentum coefficient.
- Joint ridge cross-check: median miss ×2.64, within 0.14× of the sequential model.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

Node 22, standard library only, no network. Two runs write the same bytes.

## Layout

- `main.ts` — entrypoint: snapshot → board → dashboard data → dossier.
- `lib/model.ts` — the model, the validation and the farm economics.
- `lib/data.ts` — `data.js` and `board.json`.
- `dashboard/` — the page (index.html, app.css, app.js).
- `vendor/makefun-board.ts` — the kit's dossier builder, byte-identical to the starter.
- `screenshots/` — three screenshots of the board, a protocol, and the Method tab.
