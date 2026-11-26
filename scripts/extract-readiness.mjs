// Builds src/data/readiness.json from the AI readiness questions in the ai-governance repo.
// Run: npm run extract:readiness [-- path/to/ai_readiness_qs.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { slug, sourcePath } from './markdown.mjs';

const source = sourcePath(process.argv[2], 'research/ai_readiness_qs.json');
const out = new URL('../src/data/readiness.json', import.meta.url);
const questions = JSON.parse(readFileSync(source, 'utf8'));

// "agentic-ai-lens" → "Agentic AI"
const lensName = (id) =>
  id
    .replace(/-lens$/, '')
    .split('-')
    .map((w) => (w === 'ai' || w === 'ml' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

// Categories run from strategy to operations; any new category is added at the end.
const ORDER = [
  'Use Cases & Value',
  'People, Skills & Culture',
  'Data Foundations',
  'Platform & Architecture',
  'Security & Privacy',
  'Governance, Risk & Responsible AI',
  'Operations (MLOps/LLMOps)',
];

const categories = [];
for (const q of questions) {
  let category = categories.find((c) => c.name === q.category);
  if (!category) {
    category = { id: slug(q.category), name: q.category, questions: [] };
    categories.push(category);
  }
  const lensId = slug(q.lens.replace(/-lens$/, ''));
  // "None of these" is kept as a flag rather than a practice, so it never counts towards a score.
  const practices = q.choices.filter((c) => !/^none of these$/i.test(c.title.trim()));
  category.questions.push({
    // The id includes the lens so answers saved in visitors' browsers stay attached.
    id: `${lensId}-${slug(q.title)}`.slice(0, 90).replace(/-$/, ''),
    title: q.title.trim(),
    description: q.description.trim(),
    lens: lensName(q.lens),
    practices: practices.map((c) => ({ title: c.title.trim(), why: c.helpfulResource?.displayText?.trim() ?? '' })),
    hasNone: practices.length < q.choices.length,
  });
}
const rank = (c) => (ORDER.includes(c.name) ? ORDER.indexOf(c.name) : ORDER.length);
categories.sort((a, b) => rank(a) - rank(b));

const total = categories.reduce((n, l) => n + l.questions.length, 0);
const ids = categories.flatMap((l) => l.questions.map((q) => q.id));
if (new Set(ids).size !== ids.length) throw new Error('Two questions share an id; make the slug longer');

writeFileSync(out, JSON.stringify(categories, null, 2) + '\n');
console.log(`Wrote ${total} questions in ${categories.length} categories to ${fileURLToPath(out)}`);
