import subjects from '../data/subjects.json';
import glossary from '../data/glossary.json';
import { inline, plain } from './inline';

export type Subject = (typeof subjects)[number];

// Subjects with Considerations and Why it matters get their own page.
export const isInDepth = (s: Subject) => s.sections.length > 1;
export const inDepthSubjects = subjects.filter(isInDepth);
export const subjectHref = (s: Subject) => (isInDepth(s) ? `/subjects/${s.slug}` : `/subjects#${s.slug}`);

export const section = (s: Subject, title: string) => s.sections.find((sec) => sec.title === title);

// Opening clause of the description, up to the first colon or full stop.
export function summary(s: Subject): string {
  const text = plain(s.sections[0].items[0]?.text ?? '');
  const end = text.search(/[:.](\s|$)/);
  return end > 40 ? text.slice(0, end) + '.' : text;
}

// Considerations read "Label: detail"; split them so each can be a card.
export function considerations(s: Subject): { label: string; text: string }[] {
  return (section(s, 'Considerations')?.items ?? []).map((i) => {
    const m = i.text.match(/^([^:]{2,45}):\s+(.+)$/);
    return m ? { label: m[1], text: m[2].charAt(0).toUpperCase() + m[2].slice(1) } : { label: '', text: i.text };
  });
}

// Up to `limit` subjects that share the first word of the name (e.g. the other
// "Model …" subjects), in-depth ones first.
export function related(s: Subject, limit = 6): Subject[] {
  const first = s.subject.split(' ')[0];
  return subjects
    .filter((o) => o !== s && o.subject.split(' ')[0] === first)
    .sort((a, b) => Number(isInDepth(b)) - Number(isInDepth(a)))
    .slice(0, limit);
}

export function readingMinutes(s: Subject): number {
  const words = s.sections.flatMap((sec) => sec.items).reduce((n, i) => n + i.text.split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / 200));
}

const terms = [...glossary].sort((a, b) => b.term.length - a.term.length);
const escapeAttr = (text: string) => plain(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Inline HTML with the first mention of each glossary term on the page linked,
// showing its meaning on hover. Pass one `seen` set for the whole page.
export function withTerms(text: string, seen: Set<string>): string {
  const links: string[] = [];
  const html = inline(text)
    .split(/(<code>.*?<\/code>)/)
    .map((part) => {
      if (part.startsWith('<code>')) return part;
      for (const t of terms) {
        if (seen.has(t.slug)) continue;
        const re = new RegExp(`\\b${t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i');
        part = part.replace(re, (match) => {
          seen.add(t.slug);
          links.push(
            `<a class="gloss" href="/glossary#${t.slug}">${match}<span class="gloss-tip" role="tooltip"><strong>${t.term}</strong>${escapeAttr(t.meaning)}</span></a>`,
          );
          return `\u0000${links.length - 1}\u0000`;
        });
      }
      return part;
    })
    .join('');
  return html.replace(/\u0000(\d+)\u0000/g, (_, n) => links[Number(n)]);
}

export const glossaryTerm = (slug: string) => glossary.find((t) => t.slug === slug)!;
