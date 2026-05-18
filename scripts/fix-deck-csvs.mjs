// One-shot repair for /public/decks/*.csv files where a sub-agent forgot to
// wrap context-field commas in double quotes (RFC 4180). The files follow a
// strict shape: word,pinyin,context where word + pinyin never contain commas
// and context may. We split each data row on the FIRST two commas, treat the
// rest as context, then re-emit with proper escaping.
//
// Safe to re-run: rows that are already properly quoted are left untouched.
//
// Usage: node scripts/fix-deck-csvs.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const decksDir = join(root, '..', 'public', 'decks');

function escapeIfNeeded(field) {
  // If already quoted as "..." with matching outer quotes, normalize internal
  // doubled-quotes but otherwise keep as-is.
  if (field.startsWith('"') && field.endsWith('"') && field.length >= 2) {
    return field;
  }
  // Needs quoting when it contains a comma, newline, or unescaped quote.
  if (/[",\n\r]/.test(field)) {
    const escaped = field.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  return field;
}

function splitFirstTwoCommas(line) {
  const i1 = line.indexOf(',');
  if (i1 === -1) return null;
  const i2 = line.indexOf(',', i1 + 1);
  if (i2 === -1) return null;
  return [line.slice(0, i1), line.slice(i1 + 1, i2), line.slice(i2 + 1)];
}

let totalChanges = 0;

for (const name of readdirSync(decksDir)) {
  if (!name.endsWith('.csv')) continue;
  const path = join(decksDir, name);
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);

  let fileChanges = 0;
  const fixed = lines.map((line, idx) => {
    if (idx === 0) return line; // header
    if (line === '') return line; // trailing blank
    const parts = splitFirstTwoCommas(line);
    if (!parts) return line;
    const [word, pinyin, context] = parts;
    const rebuilt = `${word},${pinyin},${escapeIfNeeded(context)}`;
    if (rebuilt !== line) fileChanges += 1;
    return rebuilt;
  });

  if (fileChanges > 0) {
    writeFileSync(path, fixed.join('\n'), 'utf8');
    totalChanges += fileChanges;
    console.log(`${name}: fixed ${fileChanges} rows`);
  } else {
    console.log(`${name}: already clean`);
  }
}

console.log(`\nTotal rows fixed: ${totalChanges}`);
