// The dashboard's data, written beside the page as data.js.
//
// Everything the page renders comes from here: the board rows, the traded
// anchors, the set-aside list, the validation numbers and the farm-next
// cards. The page itself holds no numbers — it only renders this file, so
// the page and board.json cannot drift apart. data.js is not part of the
// dossier's 65,536-byte source text (only dashboard/ is), which is why the
// rows live here and not in app.js.

import type { RadarData } from './model.ts';

/** The whole radar, as one script the page reads on load. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** The board file the gate reads: ranks 1..N, implied values, farm steps. */
export function boardFile(radar: RadarData): string {
  return `${JSON.stringify({ rows: radar.rows })}\n`;
}
