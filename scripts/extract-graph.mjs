// Builds src/data/graph.json, the home page's control graph, from the Control Graph the
// ai-governance repo's graph/extract.py writes. It keeps a readable slice of it:
// policies → governance subjects → controls, the asset classes those controls protect,
// and the risks to those assets, held back by the controls that mitigate them.
// Run: npm run extract:graph [-- path/to/graph.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestGraph } from './markdown.mjs';

const source = process.argv[2] ? resolve(process.argv[2]) : latestGraph();
if (!source) throw new Error('No graph.json found; run graph/extract.py in the ai-governance repo first');
const out = new URL('../src/data/graph.json', import.meta.url);
const graph = JSON.parse(readFileSync(source, 'utf8'));

const KEEP = new Set(['control_policy', 'governance_subject', 'control', 'asset_class', 'risk']);
const nodes = graph.nodes
  .filter((n) => KEEP.has(n.type))
  .map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    ...(n.kind && { kind: n.kind }),
    ...(n.type === 'risk' && { level: n.residual_level, before: n.inherent_level }),
  }));
const kept = new Set(nodes.map((n) => n.id));

// A subject is enforced by the controls that satisfy its requirements.
const subjectOf = new Map(graph.edges.filter((e) => e.type === 'HAS_REQUIREMENT').map((e) => [e.target, e.source]));
const links = new Map();
const link = (source, target, type) => {
  if (kept.has(source) && kept.has(target)) links.set(`${source}>${target}`, { source, target, type });
};
for (const e of graph.edges) {
  if (e.type === 'HAS_SUBJECT') link(e.source, e.target, 'has_subject');
  if (e.type === 'SATISFIED_BY' && subjectOf.has(e.source)) link(subjectOf.get(e.source), e.target, 'enforced_by');
  if (e.type === 'PROTECTED_BY') link(e.source, e.target, 'protected_by');
  if (e.type === 'MITIGATED_BY') link(e.source, e.target, 'mitigated_by');
  if (e.type === 'HAS_RISK') link(e.source, e.target, 'has_risk');
}

const count = (type) => nodes.filter((n) => n.type === type).length;
const data = {
  generated: graph.meta?.generated ?? null,
  counts: {
    policies: count('control_policy'),
    subjects: count('governance_subject'),
    controls: count('control'),
    assets: count('asset_class'),
    risks: count('risk'),
  },
  nodes,
  links: [...links.values()],
};
writeFileSync(out, JSON.stringify(data) + '\n');
console.log(`Wrote ${nodes.length} nodes and ${data.links.length} links from ${source} to ${fileURLToPath(out)}`);
