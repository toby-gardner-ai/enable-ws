// Builds src/data/glossary.json and src/data/subjects.json from the
// Governance Subject Register in the ai-governance repo.
// Run: npm run extract:governance [-- path/to/governance_subject.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../../../ai-governance/admin/governance_subject.md', import.meta.url));
const dataDir = new URL('../src/data/', import.meta.url);
const lines = readFileSync(source, 'utf8').split('\n');

// Split a Markdown table row on unescaped pipes.
const cells = (row) =>
  row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

// Rows of the table whose header starts with `firstColumn`.
function table(firstColumn) {
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
const clean = (text) =>
  text
    .replace(/\s*\(\[[A-Z0-9_-]+\][^)]*\)/g, '')
    .replace(/\s*See \[[A-Z0-9_-]+\]\./g, '')
    .replace(/\[([A-Z0-9_-]+)\]/g, '$1')
    .trim();

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const glossary = table('Term')
  .map((r) => ({ term: r.Term, slug: slug(r.Term), meaning: clean(r.Meaning) }))
  .sort((a, b) => a.term.localeCompare(b.term));

// A description cell is blocks separated by <br><br>, each headed **Title**<br>,
// with lines starting "- " as bullet points.
// Some descriptions continue the heading ("is how far…"), so they get the subject prepended.
function sections(subject, description) {
  return description.split('<br><br>').map((block) => {
    const [, title = 'Description', body = block] = block.match(/^\*\*(.+?)\*\*<br>([\s\S]*)$/) ?? [];
    const items = body.split('<br>').filter(Boolean).map((line) =>
      line.startsWith('- ')
        ? { type: 'li', text: clean(line.slice(2)) }
        : { type: 'p', text: clean(line) },
    );
    if (items[0]?.type === 'p') {
      items[0].text = /^is /i.test(items[0].text) ? `${subject} ${items[0].text}` : capitalise(items[0].text);
    }
    return { title, items };
  });
}

const subjects = table('Governance Subject')
  .map((r) => ({
    subject: r['Governance Subject'],
    slug: slug(r['Governance Subject']),
    sections: sections(r['Governance Subject'], r.Description),
  }))
  .sort((a, b) => a.subject.localeCompare(b.subject));

writeFileSync(new URL('glossary.json', dataDir), JSON.stringify(glossary, null, 2) + '\n');
writeFileSync(new URL('subjects.json', dataDir), JSON.stringify(subjects, null, 2) + '\n');
console.log(`Wrote ${glossary.length} terms and ${subjects.length} subjects to ${fileURLToPath(dataDir)}`);
