import data from '../data/controls.json';
import subjects from '../data/subjects.json';
import glossary from '../data/glossary.json';
import { inline } from './inline';
import { isInDepth, subjectHref, type Subject } from './subjects';

export type Control = (typeof data.controls)[number];
export type Kind = keyof typeof data.kinds;
export type Enforcement = keyof typeof data.enforcement;

export const { controls, gates, kinds, enforcement, standing } = data;

// How the Gates group into the life of an agent. Standing controls sit outside it.
export const PHASES = [
  { name: 'Set up', gates: ['establish'] },
  { name: 'Build & release', gates: ['author', 'pr', 'merge', 'promote'] },
  { name: 'Run', gates: ['load', 'ingress', 'action', 'response'] },
  { name: 'Operate & retire', gates: ['operate', 'exit'] },
];
export const STANDING = { id: 'standing', name: 'Always on', moment: '', stops: '' };

export const KIND_LABEL: Record<string, string> = { check: 'Check', configuration: 'Configuration', procedure: 'Procedure' };
export const KIND_PLURAL: Record<string, string> = { check: 'Checks', configuration: 'Configurations', procedure: 'Procedures' };
export const KIND_ICON: Record<string, string> = { check: '✓', configuration: '⚙', procedure: '☰' };
export const ENFORCEMENT_LABEL: Record<string, string> = { blocking: 'Blocking', reporting: 'Reporting', attested: 'Attested' };

export const gateName = (id: string) => (id === 'standing' ? STANDING.name : gates.find((g) => g.id === id)?.name ?? id);
export const controlHref = (c: Control | string) => `/controls/library/${(typeof c === 'string' ? c : c.id).toLowerCase()}`;
export const controlsAt = (gate: string) => controls.filter((c) => c.gates.some((g) => g.gate === gate));

// Subjects and controls meet on requirement numbers such as "8.6".
const requirementSubjects = new Map<string, Subject>();
for (const s of subjects) for (const r of s.requirements) requirementSubjects.set(r, s);

export const subjectsFor = (c: Control): Subject[] => [
  ...new Set(c.requirements.map((r) => requirementSubjects.get(r)).filter((s): s is Subject => !!s)),
];
export const controlsFor = (s: Subject): Control[] => controls.filter((c) => c.requirements.some((r) => s.requirements.includes(r)));

// Up to `limit` controls that serve the most subjects in common with this one.
export function relatedControls(c: Control, limit = 6): Control[] {
  const mine = new Set(subjectsFor(c));
  return controls
    .filter((o) => o !== c)
    .map((o) => ({ o, shared: subjectsFor(o).filter((s) => mine.has(s)).length }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, limit)
    .map(({ o }) => o);
}

// Inline HTML with control ids (CHK-28) linked to their pages, and gate values
// (`pr`) shown by name.
export const withControlLinks = (text: string) =>
  inline(text)
    .replace(/<code>([a-z]+)<\/code>/g, (code, id) => (gates.some((g) => g.id === id) ? gateName(id) : code))
    .replace(/\b(CHK|CFG|PRC)-\d+\b/g, (id) =>
      controls.some((c) => c.id === id) ? `<a href="${controlHref(id)}">${id}</a>` : id,
    );

// An asset class with a glossary entry links to it.
export const glossaryFor = (name: string) => glossary.find((t) => t.term.toLowerCase() === name.toLowerCase());

export { isInDepth, subjectHref };
