// Builds src/data/glossary.json and src/data/subjects.json from the
// Governance Subject Register in the ai-governance repo.
// Run: npm run extract:governance [-- path/to/governance_subject.md]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { capitalise, clean, readLines, slug, sourcePath, table } from './markdown.mjs';

const lines = readLines(sourcePath(process.argv[2], 'admin/governance_subject.md'));
const dataDir = new URL('../src/data/', import.meta.url);

const glossary = table(lines, 'Term')
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

const subjects = table(lines, 'Governance Subject')
  .map((r) => ({
    subject: r['Governance Subject'],
    slug: slug(r['Governance Subject']),
    sections: sections(r['Governance Subject'], r.Description),
    // Requirement numbers such as "8.6", which the controls that serve this subject cite.
    requirements: [...r.Requirements.matchAll(/(?:^|<br>|,\s*)(\d+\.\d+)\b/g)].map((m) => m[1]),
  }))
  .sort((a, b) => a.subject.localeCompare(b.subject));

writeFileSync(new URL('glossary.json', dataDir), JSON.stringify(glossary, null, 2) + '\n');
writeFileSync(new URL('subjects.json', dataDir), JSON.stringify(subjects, null, 2) + '\n');
console.log(`Wrote ${glossary.length} terms and ${subjects.length} subjects to ${fileURLToPath(dataDir)}`);
