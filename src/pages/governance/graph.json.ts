// The home page's control graph, served as a static file so the page stays light.
// Each node carries the page it opens on this site, if it has one.
import graph from '../../data/graph.json';
import subjects from '../../data/subjects.json';
import { controlHref, glossaryFor } from '../../lib/controls';
import { subjectHref } from '../../lib/subjects';
import { riskHref } from '../../lib/risks';

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function href(node: (typeof graph.nodes)[number]): string | null {
  if (node.type === 'control') return controlHref(node.id);
  if (node.type === 'risk') return riskHref(node.id);
  if (node.type === 'governance_subject') {
    const subject = subjects.find((s) => s.slug === slug(node.title));
    return subject ? subjectHref(subject) : null;
  }
  if (node.type === 'asset_class') {
    const term = glossaryFor(node.title);
    return term ? `/glossary#${term.slug}` : null;
  }
  return null;
}

export function GET() {
  const body = {
    counts: graph.counts,
    nodes: graph.nodes.map((n) => ({ ...n, href: href(n) })),
    links: graph.links,
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}
