import data from '../data/risks.json';
import { controls } from './controls';

export type Risk = (typeof data.risks)[number];
export type Level = 'low' | 'medium' | 'high';

export const { risks, assets, scales, catalogues } = data;
export const LEVELS: Level[] = ['high', 'medium', 'low'];
export const LEVEL_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };
export const CIA_LABEL: Record<string, string> = { C: 'Confidentiality', I: 'Integrity', A: 'Availability' };

// The risk method's level for a cell of the matrix: likelihood × impact.
export const levelOf = (likelihood: number, impact: number): Level => {
  const score = likelihood * impact;
  return score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low';
};

export const riskHref = (r: Risk | string) => `/risks/${(typeof r === 'string' ? r : r.id).toLowerCase().replace(/\./g, '-')}`;
export const assetTitle = (id: string) => assets.find((a) => a.id === id)?.title ?? id.replace(/_/g, ' ');
export const risksFor = (controlId: string) => risks.filter((r) => r.controls.includes(controlId));
export const controlById = (id: string) => controls.find((c) => c.id === id);
export const count = (level: Level, when: 'inherent' | 'residual') => risks.filter((r) => r[when].level === level).length;

// A threat reference ("LLM01:2025", "AML.T0051.001") with the catalogue it comes from and, for
// MITRE ATLAS, a link to the technique.
export function threatRef(ref: string): { label: string; catalogue: string; href: string | null } {
  if (/^AML\.T\d+/.test(ref)) return { label: ref, catalogue: 'MITRE ATLAS', href: `https://atlas.mitre.org/techniques/${ref}` };
  if (/^LLM\d+:\d{4}$/.test(ref)) return { label: ref.split(':')[0], catalogue: `OWASP LLM Top 10 ${ref.split(':')[1]}`, href: null };
  if (/^ASI\d+$/.test(ref)) return { label: ref, catalogue: 'OWASP Agentic Top 10', href: null };
  return { label: ref.charAt(0).toUpperCase() + ref.slice(1), catalogue: 'Obligation', href: null };
}
