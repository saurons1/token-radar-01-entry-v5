// Token Radar v5 — program entrypoint (model "radar-6").
//
// Reads the sealed snapshot, prices the board, writes the dashboard's data,
// copies the dashboard and the screenshots, and builds the dossier with the
// kit's buildDossier. Node 22, standard library only; no network. Two runs
// write the same bytes: the bootstrap and the walk-forward use a seeded
// generator where they resample, every sort is stable, and nothing reads
// the clock.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
//
// The output directory holds board.json, data.js, dashboard/, screenshots/
// and dossier.json. The run prints one line per stage and a short summary
// with the numbers the Method tab shows.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { boardFile, dataScript } from './lib/data.ts';
import { buildRadar, parseSnapshot } from './lib/model.ts';

const TEXT_CAP = 65536;
const SHOT_CAP = 512 * 1024;
const DASH_CAP = 4 * 1024 * 1024;

function die(message: string): never {
  console.error(`token radar: ${message}`);
  process.exit(1);
}

/** --input <file> and --output <dir>; MAKEFUN_OUTPUT_DIR is the fallback. */
function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '';
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && i + 1 < argv.length) input = argv[++i]!;
    else if (argv[i] === '--output' && i + 1 < argv.length) output = argv[++i]!;
    else if (argv[i]!.startsWith('--input=')) input = argv[i]!.slice('--input='.length);
    else if (argv[i]!.startsWith('--output=')) output = argv[i]!.slice('--output='.length);
  }
  if (!input) die('pass --input <snapshot.json>');
  if (!output) die('pass --output <dir> or set MAKEFUN_OUTPUT_DIR');
  return { input, output };
}

function snapshotPath(inputArg: string): string {
  if (existsSync(inputArg)) return inputArg;
  const here = dirname(fileURLToPath(import.meta.url));
  const kit = join(here, '..', 'input', 'snapshot.json');
  if (existsSync(kit)) return kit;
  return inputArg;
}

function mirrorDir(from: string, to: string): string[] {
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    if (statSync(src).isDirectory()) {
      copied.push(...mirrorDir(src, dst));
    } else {
      copyFileSync(src, dst);
      copied.push(name);
    }
  }
  return copied;
}

function checkShots(dir: string): string[] {
  if (!existsSync(dir)) die(`screenshots/ is missing from ${dir}`);
  const names = readdirSync(dir)
    .filter((n) => !n.startsWith('.'))
    .sort();
  if (names.length < 3 || names.length > 4) die(`screenshots/ must hold 3 or 4 images, found ${names.length}`);
  for (const n of names) {
    const st = statSync(join(dir, n));
    if (!st.isFile() || st.size > SHOT_CAP) die(`screenshot ${n} is not a file under 512 KiB`);
    if (!/\.(png|jpg|jpeg)$/i.test(n)) die(`screenshot ${n} is not a PNG or JPEG`);
  }
  return names;
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(readFileSync(snapshotPath(input), 'utf8')) as unknown;
  const snap = parseSnapshot(raw);
  const radar = buildRadar(snap);

  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'board.json'), boardFile(radar));
  writeFileSync(join(output, 'data.js'), dataScript(radar));
  const dashFiles = mirrorDir(join(here, 'dashboard'), join(output, 'dashboard'));
  const shots = checkShots(join(here, 'screenshots'));
  mirrorDir(join(here, 'screenshots'), join(output, 'screenshots'));
  const dossier = buildDossier(output, {
    text_max_bytes: TEXT_CAP,
    screenshots: { max: 4, max_bytes: SHOT_CAP },
    dashboard: { max_files: 400, max_bytes: DASH_CAP },
  });
  writeFileSync(join(output, 'dossier.json'), dossier);

  const v = radar.validation;
  console.log(`token radar: ${snap.protocols.length} protocols, ${snap.watchlist.length} on the watchlist, ${radar.rows.length} rows scored (${radar.counts.preToken - radar.rows.length} pre-token set aside, ${radar.counts.traded} traded)`);
  console.log(`token radar: first pass ${radar.counts.comps} comps, ${radar.counts.outliers} outliers set aside; curve log10(mcap) = ${v.fit.a.toFixed(4)} + ${v.fit.b.toFixed(4)}*log10(TVL) on ${v.fit.n} comparables, R2 ${v.fit.r2}`);
  console.log(`token radar: LOO full x${v.loo.full.medianMiss} (no-category x${v.loo.noCategory.medianMiss}, no-momentum x${v.loo.noMomentum.medianMiss}, curve alone x${v.loo.curveOnly.medianMiss}, flat x${v.loo.flat.medianMiss}); time split 2024 x${v.split2024.full.medianMiss} (${v.split2024.pre}/${v.split2024.post}), 2025 x${v.split2025.full.medianMiss} (${v.split2025.pre}/${v.split2025.post})`);
  console.log(`token radar: walk-forward overall x${v.walkForward.overall.medianMiss} (curve x${v.walkForward.overallCurve.medianMiss}); folds ${v.walkForward.folds.map((f) => `${f.boundary.slice(0, 4)} x${f.full.medianMiss}`).join(', ')}`);
  console.log(`token radar: ridge cross-check x${v.ridge.medianMiss} (curve x${v.ridge.curveOnlyMiss}); tilts move ${v.tiltsMove} of ${radar.rows.length} ranks 5+ places; bootstrap ${v.bootstrapRefits} refits; term-selection rows ${v.termSelection.length}`);
  console.log(`token radar: verdicts at $1,000 / 10% low end: FARM ${radar.verdicts.farm}, THIN ${radar.verdicts.thin}, SKIP ${radar.verdicts.skip} (point value: ${radar.pointVerdicts.farm}/${radar.pointVerdicts.thin}/${radar.pointVerdicts.skip}); top ${fmtUsd(radar.rows[0]!.implied_value_usd)} ${radar.rows[0]!.name}`);
  console.log(`token radar: wrote ${output}/board.json, ${output}/data.js, ${output}/dashboard (${dashFiles.length} files), ${output}/screenshots (${shots.length} images) and ${output}/dossier.json`);
}

main();
