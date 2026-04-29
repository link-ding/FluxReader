import { storeGet, storeSet } from './store.js';

function legacyKey(bookId) {
  return `annotations-${bookId}`;
}

function storeKey(bookId) {
  return `annotations:${bookId}`;
}

function readLegacyAnnotations(bookId) {
  try {
    return JSON.parse(localStorage.getItem(legacyKey(bookId)) || '[]');
  } catch {
    return [];
  }
}

function persistAnnotations(bookId, list) {
  void storeSet(storeKey(bookId), list);
  try {
    localStorage.setItem(legacyKey(bookId), JSON.stringify(list));
  } catch {}
}

export function getAnnotations(bookId) {
  const stored = storeGet(storeKey(bookId), null);
  if (Array.isArray(stored)) return stored;

  const legacy = readLegacyAnnotations(bookId);
  if (legacy.length > 0) persistAnnotations(bookId, legacy);
  return legacy;
}

export function upsertAnnotation(bookId, ann) {
  const list = getAnnotations(bookId);
  const idx = list.findIndex(a => a.id === ann.id);
  if (idx >= 0) list[idx] = ann;
  else list.push(ann);
  persistAnnotations(bookId, list);
  return list;
}

export function removeAnnotation(bookId, annId) {
  const list = getAnnotations(bookId).filter(a => a.id !== annId);
  persistAnnotations(bookId, list);
  return list;
}

const COLOR_NAMES = { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink' };

export function generateMarkdown(book, annotations) {
  const updated = new Date().toISOString().slice(0, 10);
  const lines = [
    `# ${book.title}`,
    ``,
    `**Author**: ${book.author}`,
    `**Updated**: ${updated}`,
    ``,
    `---`,
    ``,
    `## Highlights`,
    ``,
  ];

  if (!annotations.length) {
    lines.push(`*No highlights yet.*`);
    return lines.join('\n');
  }

  const sorted = [...annotations].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const byChapter = {};
  for (const ann of sorted) {
    const ch = ann.chapter || 'General';
    if (!byChapter[ch]) byChapter[ch] = [];
    byChapter[ch].push(ann);
  }

  for (const [chapter, anns] of Object.entries(byChapter)) {
    lines.push(`### ${chapter}`, ``);
    for (const ann of anns) {
      const date = ann.createdAt.slice(0, 10);
      const text = ann.text.replace(/\n+/g, ' ').trim();
      lines.push(`> ${text}`, ``);
      if (ann.note) lines.push(`**Note**: ${ann.note}`, ``);
      lines.push(`*${COLOR_NAMES[ann.color] || 'Highlight'} · ${date}*`, ``, `---`, ``);
    }
  }

  return lines.join('\n');
}
