// Token launch radar — full build.
// Reads the snapshot, builds the radar, writes out/board.json and
// out/data.js, mirrors the dashboard into out/, and bundles the dossier
// (dashboard source + screenshots) into out/dossier.json.
//
//   node main.ts [snapshot.json]
//
// With no argument it reads the kit snapshot next to this repo. The
// bootstrap seed is the anchor round in .makefun/freshness.json, so the
// build is reproducible from the repo alone.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRadar, parseSnapshot } from "./lib/model.ts";
import { boardFile, dataScript, dossierFile, dossierText } from "./lib/data.ts";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "out");
const dashDir = join(root, "dashboard");
const shotsDir = join(root, "screenshots");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function anchorRound(): number {
  try {
    const fresh = readJson(join(root, ".makefun", "freshness.json")) as { round?: number };
    if (typeof fresh.round === "number") return fresh.round;
  } catch {
    // No anchor file — fall back to the round this entry was anchored at.
  }
  return 34038550;
}

function main(): void {
  const snapPath = process.argv[2]
    ?? join(root, "..", "token-radar-01-kit", "token-radar-01-kit", "input", "snapshot.json");
  if (!existsSync(snapPath)) {
    throw new Error(`snapshot not found: ${snapPath} (pass its path as the first argument)`);
  }
  const snap = parseSnapshot(readJson(snapPath));
  const radar = buildRadar(snap, anchorRound());

  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "dashboard"), { recursive: true });
  mkdirSync(join(outDir, "screenshots"), { recursive: true });

  const board = boardFile(radar);
  const data = dataScript(radar);
  writeFileSync(join(outDir, "board.json"), board);
  writeFileSync(join(outDir, "data.js"), data);

  const dashFiles = readdirSync(dashDir).filter((f) => f.endsWith(".html") || f.endsWith(".js") || f.endsWith(".css")).sort();
  for (const f of dashFiles) copyFileSync(join(dashDir, f), join(outDir, "dashboard", f));

  const shotNames = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((f) => f.endsWith(".png")).sort()
    : [];
  const images: string[] = [];
  for (const f of shotNames) {
    images.push(readFileSync(join(shotsDir, f)).toString("base64"));
    copyFileSync(join(shotsDir, f), join(outDir, "screenshots", f));
  }
  if (images.length === 0) {
    console.warn("warning: no screenshots in screenshots/ — dossier will carry no images");
  }

  const files = dashFiles.map((name) => {
    const lang = name.endsWith(".css") ? "css" : name.endsWith(".js") ? "js" : "html";
    return { name, lang, content: readFileSync(join(dashDir, name), "utf8") };
  });
  const text = dossierText(files);
  const dossier = dossierFile(images, text);
  writeFileSync(join(outDir, "dossier.json"), dossier);

  const v = radar.validation;
  const top = radar.rows[0];
  console.log(`rows ${radar.rows.length} (watchlist ${radar.counts.watchlistCovered}/${radar.counts.watchlist})`);
  console.log(`comps ${radar.counts.comps} kept ${radar.counts.kept} outliers ${radar.counts.outliers}`);
  console.log(`fit log10(mcap) = ${radar.fit.a.toFixed(4)} + ${radar.fit.b.toFixed(4)} log10(TVL), R2 ${radar.fit.r2}`);
  console.log(`first pass a=${v.firstA} b=${v.firstB} sd=${v.firstSd}`);
  console.log(`LOO full x${v.loo.full.medianMiss} curve x${v.loo.curveOnly.medianMiss} flat x${v.loo.flat.medianMiss}`);
  console.log(`TS-2024 x${v.split2024.full.medianMiss} TS-2025 x${v.split2025.full.medianMiss}`);
  console.log(`walk-forward overall x${v.walkForward.overall.medianMiss} curve x${v.walkForward.overallCurve.medianMiss}`);
  console.log(`ridge x${v.ridge.medianMiss} (within3 ${v.ridge.within3}) tilts move ${v.tiltsMove} rows`);
  console.log(`verdicts low-end FARM ${radar.verdicts.farm} THIN ${radar.verdicts.thin} SKIP ${radar.verdicts.skip} (point ${radar.pointVerdicts.farm}/${radar.pointVerdicts.thin}/${radar.pointVerdicts.skip})`);
  console.log(`top ${top.name} $${top.implied_value_usd.toLocaleString("en-US")}`);
  console.log(`data.js ${Buffer.byteLength(data, "utf8")} B, board.json ${Buffer.byteLength(board, "utf8")} B, dossier ${Buffer.byteLength(dossier, "utf8")} B`);
}

main();
