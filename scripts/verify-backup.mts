#!/usr/bin/env node --experimental-transform-types
/**
 * Регресія резервного копіювання профілів (RECOMMENDATIONS §6).
 *
 * Перевіряє повний цикл: архівування партиції → шифрування паролем
 * користувача → відновлення, плюс стійкість до хибного пароля й підміни
 * шифротексту. Помилка тут означає непридатні бекапи авторизованих сесій,
 * що з'ясується лише в момент, коли вони потрібні.
 *
 * Модулі копіюються у тимчасову теку з дописаними розширеннями: збірка
 * використовує безрозширенневі імпорти, а Node ESM їх не резолвить.
 * Так тест працює без бандлера і не спотворює продакшн-код.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(tmpdir(), `mf-backup-verify-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

for (const name of ['archive', 'backup']) {
  const src = readFileSync(join(root, 'src', 'main', 'persistence', `${name}.ts`), 'utf8');
  writeFileSync(join(work, `${name}.ts`), src.replace(/from '\.\/archive'/g, "from './archive.ts'"));
}

const { createBackup, readBackup, restoreStorage, BackupPasswordError } = await import(pathToFileURL(join(work, 'backup.ts')).href);
const { packDirectory, unpackDirectory } = await import(pathToFileURL(join(work, 'archive.ts')).href);

const t = (n: string, ok: boolean, extra = ''): number => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${extra ? '  (' + extra + ')' : ''}`);
  return ok ? 0 : 1;
};
let bad = 0;

// --- імітація партиції профілю ---
const src = join(work, 'partition');
mkdirSync(join(src, 'Local Storage', 'leveldb'), { recursive: true });
mkdirSync(join(src, 'Network'), { recursive: true });
writeFileSync(join(src, 'Network', 'Cookies'), Buffer.from('SQLite format 3\0cookie-jar-вміст'));
writeFileSync(join(src, 'Local Storage', 'leveldb', '000003.log'), Buffer.alloc(4096, 7));
writeFileSync(join(src, 'Preferences'), JSON.stringify({ profile: { name: 'тест' } }));
writeFileSync(join(src, 'LOCK'), '');

console.log('\nАрхів каталогу:');
const packed = packDirectory(src);
const dst = join(work, 'restored');
mkdirSync(dst, { recursive: true });
const entries = unpackDirectory(packed, dst);
bad += t('файли відновлено', entries.length === 3, `${entries.length} шт`);
bad += t('службовий LOCK пропущено', !entries.some((e: { path: string }) => e.path.endsWith('LOCK')));
bad += t('cookie-jar побайтово ідентичний',
  readFileSync(join(src, 'Network', 'Cookies')).equals(readFileSync(join(dst, 'Network', 'Cookies'))));
bad += t('вкладена структура збережена', existsSync(join(dst, 'Local Storage', 'leveldb', '000003.log')));

console.log('\nПошкодження архіву виявляється:');
const broken = Buffer.from(packed);
broken[broken.length - 20] ^= 0xff;
let detected = false;
try { unpackDirectory(broken, join(work, 'broken')); } catch { detected = true; }
bad += t('пошкоджений архів відхилено', detected);

console.log('\nШифрований контейнер (RECOMMENDATIONS §6):');
const profile = { id: 'p1', name: 'Профіль 1', persistSession: true };
const PASS = 'корисний-пароль-42';
const container: Buffer = createBackup(profile, src, 'секрет-проксі', PASS);
bad += t('контейнер створено', container.length > 100, `${(container.length / 1024).toFixed(1)} КБ`);

const text = container.toString('utf8');
bad += t('пароль проксі не видно у відкритому вигляді', !text.includes('секрет-проксі'));
bad += t('вміст cookie не видно у відкритому вигляді', !text.includes('cookie-jar-вміст'));

const restored = readBackup(container, PASS);
bad += t('профіль відновлено', restored.profile.id === 'p1');
bad += t('пароль проксі відновлено', restored.proxyPassword === 'секрет-проксі');

const dst2 = join(work, 'restored2');
mkdirSync(dst2, { recursive: true });
bad += t('сховище розгорнуто з контейнера', restoreStorage(restored, dst2) === 3);
bad += t('cookies збіглися після повного циклу',
  readFileSync(join(src, 'Network', 'Cookies')).equals(readFileSync(join(dst2, 'Network', 'Cookies'))));

console.log('\nСтійкість до хибного пароля та підміни:');
let wrongRejected = false;
try { readBackup(container, 'не-той-пароль'); } catch (e) { wrongRejected = e instanceof BackupPasswordError; }
bad += t('хибний пароль відхилено', wrongRejected);

const tampered = JSON.parse(container.toString('utf8')) as Record<string, string>;
const raw = Buffer.from(tampered.data as string, 'base64');
raw[10] ^= 0xff;
tampered.data = raw.toString('base64');
let tamperRejected = false;
try { readBackup(Buffer.from(JSON.stringify(tampered)), PASS); } catch (e) { tamperRejected = e instanceof BackupPasswordError; }
bad += t('підміну шифротексту виявлено (тег GCM)', tamperRejected);

rmSync(work, { recursive: true, force: true });
console.log(`\nПроблем: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
