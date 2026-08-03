import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/**
 * Мінімальний архів каталогу без сторонніх залежностей.
 *
 * Потрібен для резервного копіювання сховища профілю (RECOMMENDATIONS §6):
 * цінність для користувача становлять не налаштування, а авторизовані сесії.
 * Node не має вбудованого zip, а тягнути залежність заради цього —
 * зайвий ризик у застосунку, що працює з чужими сесіями.
 *
 * Формат: [4 байти довжини маніфесту][JSON-маніфест][конкатеновані файли], gzip.
 */
export interface ArchiveEntry {
  path: string;
  size: number;
  sha256: string;
}

const SKIP = new Set(['LOCK', 'LOG', 'LOG.old']);

function walk(root: string, current = root, out: string[] = []): string[] {
  for (const name of readdirSync(current)) {
    if (SKIP.has(name)) continue;
    const full = join(current, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(root, full, out);
    else if (stat.isFile()) out.push(full);
  }
  return out;
}

export function packDirectory(root: string): Buffer {
  const files = walk(root);
  const manifest: ArchiveEntry[] = [];
  const blobs: Buffer[] = [];

  for (const file of files) {
    const data = readFileSync(file);
    manifest.push({
      path: relative(root, file).split(sep).join('/'),
      size: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    });
    blobs.push(data);
  }

  const header = Buffer.from(JSON.stringify(manifest), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length, 0);
  return gzipSync(Buffer.concat([length, header, ...blobs]));
}

export function unpackDirectory(archive: Buffer, root: string): ArchiveEntry[] {
  const raw = gunzipSync(archive);
  const headerLength = raw.readUInt32BE(0);
  const manifest = JSON.parse(raw.subarray(4, 4 + headerLength).toString('utf8')) as ArchiveEntry[];

  let offset = 4 + headerLength;
  for (const entry of manifest) {
    const data = raw.subarray(offset, offset + entry.size);
    offset += entry.size;

    // Цілісність перевіряється завжди: пошкоджений бекап сесій гірший
    // за його відсутність, бо створює хибну впевненість.
    const actual = createHash('sha256').update(data).digest('hex');
    if (actual !== entry.sha256) throw new Error(`Пошкоджений файл в архіві: ${entry.path}`);

    const target = join(root, ...entry.path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
  return manifest;
}
