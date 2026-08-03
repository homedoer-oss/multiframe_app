#!/usr/bin/env node
/**
 * Ф-8.13 — збірка релізу падає, якщо в будь-якій мові відсутній ключ,
 * наявний в en. Перевіряються також зайві ключі та порожні значення.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'i18n', 'locales');
const load = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

const base = load('en.json');
const baseKeys = Object.keys(base).sort();
let failures = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const locale = file.replace('.json', '');
  const data = load(file);
  const keys = Object.keys(data);

  const missing = baseKeys.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !baseKeys.includes(k));
  const empty = keys.filter((k) => typeof data[k] !== 'string' || data[k].trim() === '');

  if (missing.length) { console.error(`✗ ${locale}: відсутні ключі — ${missing.join(', ')}`); failures++; }
  if (extra.length) { console.error(`✗ ${locale}: зайві ключі — ${extra.join(', ')}`); failures++; }
  if (empty.length) { console.error(`✗ ${locale}: порожні значення — ${empty.join(', ')}`); failures++; }
  if (!missing.length && !extra.length && !empty.length) console.log(`✓ ${locale}: ${keys.length} ключів`);
}

process.exit(failures === 0 ? 0 : 1);
