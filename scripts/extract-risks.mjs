// Builds src/data/risks.json from the ai-governance repo: the risks and scenarios from the
// Risk Register, their explanations and threat references from the Control Graph, and the
// rating scales and threat catalogues from the risk method.
// Run: npm run extract:risks [-- path/to/ai-governance]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capitalise, cells, clean as cleanRefs, governanceRoot, latestGraph, readLines, table } from './markdown.mjs';

const root = process.argv[2] ? resolve(process.argv[2]) : governanceRoot;
const out = new URL('../src/data/risks.json', import.meta.url);

// Control ids stay (the pages link them, without the clause); backlog markers and other
// internal references go; requirement keywords are lowercased for reading.
const clean = (text) =>
  cleanRefs(
    text
      .replace(/\[((?:CHK|CFG|PRC)-\d+)\](?: Clauses? \.[\d.–-]+)?/g, '$1')
      .replace(/\s*\*\[open: BL-\d+\]\*/g, '')
      .replace(/\s*\(LIM\d+\)/g, '')
      .replace(/\[STD-[A-Z0-9-]+\]/g, 'the Standard')
      .replace(/\b(MUST NOT|MUST|SHOULD NOT|SHOULD|MAY)\b/g, (w) => w.toLowerCase()),
  ).replace(/\s+([.;,])/g, '$1');
const controlIds = (cell) => [...new Set([...cell.matchAll(/\b(?:CHK|CFG|PRC)-\d+/g)].map((m) => m[0]))];

// "high (2×3)" → { level, likelihood, impact }
function rating(cell) {
  const m = cell.match(/^(low|medium|high) \((\d)×(\d)\)/);
  if (!m) throw new Error(`Unreadable rating "${cell}"`);
  return { level: m[1], likelihood: Number(m[2]), impact: Number(m[3]) };
}

// The register: one "### Title (`id`)" section per asset class, each with a risk table and
// optionally a scenario table.
const lines = readLines(resolve(root, 'assets/risk_register.md'));
const assets = [];
const risks = [];
const scenarios = new Map();
let asset = null;
let header = null;
for (const line of lines) {
  const heading = line.match(/^### (.+) \(`([a-z_]+)`\)$/);
  if (heading) {
    asset = { id: heading[2], title: heading[1] };
    assets.push(asset);
    continue;
  }
  if (!asset || !line.startsWith('|') || line.startsWith('| :-')) continue;
  const row = cells(line);
  if (row[0] === 'Id' || row[0] === 'Scenario') {
    header = row;
    continue;
  }
  const r = Object.fromEntries(row.map((c, i) => [header[i], c]));
  if (header[0] === 'Id') {
    const decision = r.Treatment === 'mitigate' ? null : r['Mitigated by / decision'];
    risks.push({
      id: r.Id,
      asset: asset.id,
      title: r.Risk,
      cia: r.CIA === '—' ? [] : r.CIA.split(',').map((s) => s.trim()),
      arisesFrom: r['Arises from'] === '—' ? [] : r['Arises from'].split(',').map((s) => s.trim()),
      inherent: rating(r.Inherent),
      residual: rating(r.Residual),
      treatment: r.Treatment,
      controls: decision ? [] : controlIds(r['Mitigated by / decision']),
      decision,
      owner: r['Risk Owner'],
    });
  } else {
    scenarios.set(r.Scenario, {
      id: r.Scenario,
      title: r['What happens'],
      origin: r.Origin,
      observed: r.Observed === '—' ? null : r.Observed,
      controls: controlIds(r['Covered by']),
    });
  }
}

// The graph adds each risk's explanation, its threat references, each scenario's text and
// each asset class's family. Without it the pages show the register alone.
const graphPath = latestGraph();
const graph = graphPath && existsSync(graphPath) ? JSON.parse(readFileSync(graphPath, 'utf8')) : { nodes: [] };
const node = new Map(graph.nodes.map((n) => [n.id, n]));
for (const a of assets) a.family = node.get(a.id)?.family ? capitalise(node.get(a.id).family.replace(/_/g, ' ')) : null;

// An accepted risk's decision reads "Owner: reason; trigger: …; review by YYYY-MM-DD".
function parseDecision(text, graphDecision) {
  if (graphDecision) {
    return { by: graphDecision.by, reason: capitalise(clean(graphDecision.reason)), trigger: graphDecision.trigger ? capitalise(clean(graphDecision.trigger)) : null, reviewBy: graphDecision.review_by ?? null };
  }
  const m = text.match(/^([^:]+):\s*(.+?)(?:;\s*trigger:\s*(.+?))?(?:;\s*review by\s*(\S+))?$/);
  return m ? { by: m[1], reason: capitalise(clean(m[2])), trigger: m[3] ? capitalise(clean(m[3])) : null, reviewBy: m[4] ?? null } : { by: null, reason: clean(text), trigger: null, reviewBy: null };
}

for (const r of risks) {
  const g = node.get(r.id);
  r.text = g?.text ? clean(g.text) : null;
  r.refs = g?.refs ?? [];
  r.decision = r.decision ? parseDecision(r.decision, g?.decision) : null;
  const scenarioText = new Map((g?.scenarios ?? []).map((s) => [s.id, s.text]));
  r.scenarios = [...scenarios.values()]
    .filter((s) => s.id.startsWith(`${r.id}.S`))
    .map((s) => ({ ...s, text: scenarioText.has(s.id) ? clean(scenarioText.get(s.id)) : null }));
}

// The risk method: the two rating scales and the threat catalogues a risk's refs come from.
const method = readLines(resolve(root, 'assets/risk_method.md'));
const scaleRows = table(method, 'Score');
const short = (text) => text.split(' — ')[0].split(',')[0].replace(/\s*\(.*$/, '').trim();
const scale = (column) =>
  scaleRows.map((row) => {
    const text = clean(row[Object.keys(row).find((k) => k.startsWith(column))]);
    return { score: Number(row.Score), text, short: short(text) };
  });
const catalogues = table(method, 'Catalogue').map((r) => ({
  name: r.Catalogue,
  form: r.Form.replace(/`/g, ''),
  example: r.Example.replace(/`/g, ''),
}));

const data = { scales: { likelihood: scale('Likelihood'), impact: scale('Impact') }, catalogues, assets, risks };
writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
const withText = risks.filter((r) => r.text).length;
console.log(`Wrote ${risks.length} risks (${withText} with explanations) across ${assets.length} assets to ${fileURLToPath(out)}`);
