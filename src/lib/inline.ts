// Turns the light inline Markdown in governance text (`code`, **bold**) into safe HTML.
export function inline(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// Plain text for search indexes.
export function plain(text: string): string {
  return text.replace(/[`*]/g, '');
}

// Groups items by the first letter of a field, letters in order.
export function byFirstLetter<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const letter = key(item)[0].toUpperCase();
    groups.set(letter, [...(groups.get(letter) ?? []), item]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b));
}

// Collects consecutive list items into one list, keeping paragraphs in place.
type Item = { type: string; text: string };
export function runs(items: Item[]): ({ type: 'p'; text: string } | { type: 'ul'; items: string[] })[] {
  const out: ReturnType<typeof runs> = [];
  for (const item of items) {
    const last = out.at(-1);
    if (item.type !== 'li') out.push({ type: 'p', text: item.text });
    else if (last?.type === 'ul') last.items.push(item.text);
    else out.push({ type: 'ul', items: [item.text] });
  }
  return out;
}
