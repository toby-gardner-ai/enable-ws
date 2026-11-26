// Builds src/data/controls.json from the ai-governance repo: the controls from the
// Control Register, the Gates from the Standard and the definitions from the policy.
// Run: npm run extract:controls [-- path/to/ai-governance]
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capitalise, clean as cleanRefs, governanceRoot, readLines, table } from './markdown.mjs';

const root = process.argv[2] ? resolve(process.argv[2]) : governanceRoot;
const out = new URL('../src/data/controls.json', import.meta.url);

// On top of the shared clean-up: clause references go, a Standard section reads as
// "the Standard", and requirement keywords (MUST, MAY) are lowercased for reading.
// Control ids (CHK-28) stay, so the pages can link them.
const clean = (text) =>
  cleanRefs(
    text
      .replace(/\s*\((?:Clause|clauses?) [^)]*\)/g, '')
      .replace(/^Clauses? \.[\d.–-]+ (?:— )?/, '')
      .replace(/\s*\(\[STD-[A-Z0-9-]+\]\)/g, '')
      .replace(/\[CP\d+\] (\d+\.\d+)/g, 'requirement $1')
      .replace(/\[STD-[A-Z0-9-]+\]/g, 'the Standard')
      .replace(/\b(MUST NOT|MUST|SHOULD NOT|SHOULD|MAY)\b/g, (w) => w.toLowerCase()),
  );

// Gates: each "### 13.n Name {#STD-GATE-…}" section of the Standard with a Value bullet.
const standard = readLines(resolve(root, 'standard/agent_standard.md'));
const gates = [];
for (const [i, line] of standard.entries()) {
  const heading = line.match(/^### 13\.\d+ (.+?) \{#STD-GATE-[A-Z]+\}/);
  if (!heading) continue;
  const body = standard.slice(i + 1, standard.findIndex((l, j) => j > i && l.startsWith('#')));
  const field = (name) => body.find((l) => l.startsWith(`- **${name}:**`))?.replace(`- **${name}:**`, '').trim();
  const value = field('Value');
  if (!value) continue;
  gates.push({
    id: value.replace(/`/g, ''),
    name: heading[1],
    moment: capitalise(clean(field('Moment'))),
    stops: capitalise(clean(field('A blocking failure stops'))),
  });
}

// Definitions: the first paragraph under a "### Name {#POL-DEF-…}" heading of the policy.
const policy = readLines(resolve(root, 'admin/policy.md'));
const definition = (id) => {
  const i = policy.findIndex((l) => l.includes(`{#POL-DEF-${id}}`));
  if (i === -1) throw new Error(`No definition POL-DEF-${id}`);
  return clean(policy[i + 1]);
};
const enforcementText = definition('ENFORCEMENT');
const enforcement = Object.fromEntries(
  ['blocking', 'reporting', 'attested'].map((level) => {
    const m = enforcementText.match(new RegExp(`\\*\\*${level}\\*\\* — ([^;]+?)(?:;|\\.$)`));
    if (!m) throw new Error(`No definition of ${level} in POL-DEF-ENFORCEMENT`);
    return [level, capitalise(m[1].trim()) + '.'];
  }),
);
// Drop the "(`CHK-`, …)" id hints; the pages show the ids themselves.
const kindText = (id) => definition(id).replace(/\s*\(`[A-Z]+-nn`\)/, '').replace(/^A control of kind \w+: /, '');
const kinds = {
  check: capitalise(kindText('CONTROL_CHECK')),
  configuration: capitalise(kindText('CONTROL_CONFIGURATION')),
  procedure: capitalise(kindText('CONTROL_PROCEDURE')),
};
const standing = definition('STANDING').replace(/^Not a Gate: /, '').replace(/\s*Recorded in place of a Gate.*$/, '');

// Tier cells read "minimum: …<br>recommended: …; trigger: …".
function tier(cell) {
  if (!cell || cell === '—') return null;
  const part = (name) => cell.split('<br>').find((p) => p.startsWith(`${name}:`))?.slice(name.length + 1).trim();
  const recommended = part('recommended');
  // Split off the trigger only when there is exactly one; otherwise keep the text whole.
  const parts = recommended?.split(/[;,]\s*triggers?:\s*/) ?? [];
  const [rec, trigger] = parts.length === 2 ? parts : [recommended];
  return {
    minimum: capitalise(clean(part('minimum') ?? '')),
    recommended: rec ? capitalise(clean(rec)) : null,
    trigger: trigger ? capitalise(clean(trigger)) : null,
  };
}

const register = table(readLines(resolve(root, 'admin/control_register.md')), 'Id');
const controls = register.map((r) => {
  const risks = [...r.Mitigates.matchAll(/([a-z_]+)\.K\d+/g)].map((m) => m[1]);
  return {
    id: r.Id,
    kind: r.Kind,
    title: r.Title,
    gates: r.Gate.split(';').map((g) => {
      const [gate, level] = g.split(':').map((s) => s.trim());
      return { gate, enforcement: level };
    }),
    tier: tier(r.Tier),
    // Asset classes whose risks this control mitigates, e.g. "end_user" → "End user".
    protects: [...new Set(risks)].map((a) => capitalise(a.replace(/_/g, ' '))),
    risks: risks.length,
    // Requirement numbers it serves: "CP08.R6 (.3)" → "8.6", matching the Governance Subjects.
    requirements: [...new Set([...r.Serves.matchAll(/CP(\d+)\.R(\d+)/g)].map((m) => `${Number(m[1])}.${m[2]}`))],
  };
});

const unknown = controls.flatMap((c) => c.gates.map((g) => g.gate)).filter((g) => g !== 'standing' && !gates.some((x) => x.id === g));
if (unknown.length) throw new Error(`Controls name Gates the Standard doesn't define: ${[...new Set(unknown)].join(', ')}`);

writeFileSync(out, JSON.stringify({ kinds, enforcement, standing, gates, controls }, null, 2) + '\n');
console.log(`Wrote ${controls.length} controls and ${gates.length} gates to ${fileURLToPath(out)}`);
