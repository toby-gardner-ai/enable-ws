// Helpers shared by the extract scripts for reading the ai-governance repo's Markdown.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The ai-governance repo is expected next to personal-ws.
export const governanceRoot = fileURLToPath(new URL('../../../ai-governance/', import.meta.url));
export const sourcePath = (arg, fallback) => (arg ? resolve(arg) : resolve(governanceRoot, fallback));
export const readLines = (path) => readFileSync(path, 'utf8').split('\n');

// graph/extract.py writes graph.json to graph/out (committed) or graph/build (local); the newer, or null.
export const latestGraph = () =>
  ['graph/out/graph.json', 'graph/build/graph.json']
    .map((p) => resolve(governanceRoot, p))
    .filter(existsSync)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;

// Split a Markdown table row on unescaped pipes.
export const cells = (row) =>
  row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

// Rows of the table whose header starts with `firstColumn`.
export function table(lines, firstColumn) {
  const start = lines.findIndex((l) => l.startsWith(`| ${firstColumn} |`));
  if (start === -1) throw new Error(`No table starting with "${firstColumn}"`);
  const header = cells(lines[start]);
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(Object.fromEntries(cells(line).map((c, i) => [header[i], c])));
  }
  return rows;
}

// Internal cross-references such as ([POL-DEF-GOVERNED_EVENT]) or ([CP11] 11.11)
// mean nothing outside the governance repo, so drop them.
export const clean = (text) =>
  text
    .replace(/\s*\(\[[A-Z0-9_-]+\][^)]*\)/g, '')
    .replace(/\s*See \[[A-Z0-9_-]+\]\./g, '')
    .replace(/\[([A-Z0-9_-]+)\]/g, '$1')
    .trim();

export const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);
