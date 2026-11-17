// Token launch radar — full build.
// Reads the snapshot, builds the radar, writes out/board.json and
// out/data.js, mirrors the dashboard into out/, and bundles the dossier
// (dashboard source + screenshots) into out/dossier.json.
//
//   node main.ts [--input snapshot.json] [--output out]
//
// With no flags it reads the sealed snapshot from $MAKEFUN_INPUT_DIR
// (default /input, snapshot.json inside a directory) and writes to
// $MAKEFUN_OUTPUT_DIR (default /output), so the grader can run it
// no-args against a read-only repo. A bare positional argument still
// names the snapshot, as before. The bootstrap seed is the anchor
// round in .makefun/freshness.json, so the build is reproducible from
// the repo alone.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRadar, parseSnapshot } from "./lib/model.ts";
import { boardFile, dataScript, dossierFile, dossierText } from "./lib/data.ts";

const root = dirname(fileURLToPath(import.meta.url));
const dashDir = join(root, "dashboard");
const shotsDir = join(root, "screenshots");

/** The command line as flags plus positionals: --name value and --name=value both land under name; a flag's value is never a positional. */
function parseArgs(argv: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    if (eq === -1) {
      const name = token.slice(2);
      if (name !== "" && i + 1 < argv.length && !(name in flags)) flags[name] = argv[++i]!;
    } else {
      const name = token.slice(2, eq);
      if (name !== "" && !(name in flags)) flags[name] = token.slice(eq + 1);
    }
  }
  return { flags, positional };
}

/** The snapshot path: a .json file as given, or snapshot.json inside a directory. */
function snapshotPath(inputArg: string): string {
  return inputArg.endsWith(".json") ? inputArg : join(inputArg, "snapshot.json");
}

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
  const { flags, positional } = parseArgs(process.argv.slice(2));
  // Snapshot: --input, then a bare path, then $MAKEFUN_INPUT_DIR, then /input.
  const inputArg = flags["input"] ?? positional[0] ?? process.env.MAKEFUN_INPUT_DIR ?? "/input";
  const snapPath = snapshotPath(inputArg);
  if (!existsSync(snapPath)) {
    throw new Error(`snapshot not found: ${snapPath} (pass --input <snapshot.json|directory>, or mount the sealed /input)`);
  }
  // Outputs: --output, then a second bare path, then $MAKEFUN_OUTPUT_DIR, then /output.
  // Never inside the repo — the grader mounts it read-only.
  const outDir = flags["output"] ?? positional[1] ?? process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
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
