// Serializers: the radar object becomes the two files the dashboard and
// the gate read. Both are compact JSON — no pretty-printing, no trailing
// newline — so a rebuild is byte-identical by construction. The dossier
// text must stay under the gate's 65,536 B cap for the joined dashboard
// source, so the inventory below reports the exact byte counts.

import type { Radar } from "./model.ts";

export function boardFile(radar: Radar): string {
  return JSON.stringify({ rows: radar.rows });
}

export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};`;
}

// The dossier's markdown: a file inventory, then the dashboard source in
// fenced blocks. The byte counts come from the files as read, so the
// inventory can never drift from what is actually embedded.
export function dossierText(
  files: Array<{ name: string; lang: string; content: string }>,
): string {
  const total = files.reduce((s, f) => s + Buffer.byteLength(f.content, "utf8"), 0);
  const lines: string[] = [];
  lines.push("## Dashboard");
  lines.push(`Files: ${files.length} (${total} bytes)`);
  for (const f of files) {
    lines.push(`- ${f.name} (${Buffer.byteLength(f.content, "utf8")} bytes)`);
  }
  lines.push("");
  lines.push("## Source");
  lines.push("");
  for (const f of files) {
    lines.push(`### ${f.name}`);
    lines.push("```" + f.lang);
    lines.push(f.content.replace(/\n$/, ""));
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

export function dossierFile(images: string[], text: string): string {
  return JSON.stringify({
    cover: 0,
    images: images.map((base64) => ({ base64 })),
    schema: "makefun/dossier/v1",
    text,
  });
}
