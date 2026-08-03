import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { packDirectory, unpackDirectory } from './archive';

/**
 * RECOMMENDATIONS §6 — резервна копія профілю РАЗОМ ЗІ СХОВИЩЕМ.
 *
 * Ф-6.3 описує експорт конфігурації без паролів — цього недостатньо:
 * цінність для користувача становлять авторизовані сесії, а не налаштування
 * проксі. Втрата профілю означає втрату входів у всі акаунти, а сценарії
 * втрати буденні: пошкодження LevelDB, переустановлення Windows, збій диска.
 *
 * ⚠️ Шифрування ПАРОЛЕМ КОРИСТУВАЧА, а не safeStorage. safeStorage прив'язаний
 *    до облікового запису Windows і машини (ОБМ-4), тому копія, зроблена ним,
 *    не відновиться саме тоді, коли вона потрібна — на іншому комп'ютері.
 */
const MAGIC = 'MFBACKUP1';
const KDF_N = 1 << 15; // ~32 МБ пам'яті — свідомо дорого для перебору
const KDF_R = 8;
/**
 * OpenSSL потребує трохи більше за формулу 128·N·r, тому ліміт задається
 * із запасом. Розрахунок «впритул» дає ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
 */
const KDF_MAXMEM = 128 * KDF_N * KDF_R * 2;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Структурний тип: модуль навмисно не залежить від аліасів збірки,
 *  щоб регресійний тест виконувався звичайним Node без бандлера. */
export interface BackupProfile {
  id: string;
  name: string;
  persistSession: boolean;
  [key: string]: unknown;
}

export interface BackupPayload {
  profile: BackupProfile;
  /** Пароль проксі включається лише за явним вибором користувача. */
  proxyPassword: string | null;
  storage: string; // base64 архіву партиції
  createdAt: string;
}

export interface BackupContainer {
  magic: string;
  version: 1;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_BYTES, { N: KDF_N, r: KDF_R, p: 1, maxmem: KDF_MAXMEM });
}

export function createBackup(
  profile: BackupProfile,
  partitionDir: string | null,
  proxyPassword: string | null,
  password: string,
): Buffer {
  const payload: BackupPayload = {
    profile,
    proxyPassword,
    storage: partitionDir ? packDirectory(partitionDir).toString('base64') : '',
    createdAt: new Date().toISOString(),
  };

  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);

  const container: BackupContainer = {
    magic: MAGIC,
    version: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
  return Buffer.from(JSON.stringify(container), 'utf8');
}

export class BackupPasswordError extends Error {}

export function readBackup(file: Buffer, password: string): BackupPayload {
  let container: BackupContainer;
  try {
    container = JSON.parse(file.toString('utf8')) as BackupContainer;
  } catch {
    throw new Error('Файл не є резервною копією MultiFrame');
  }
  if (container.magic !== MAGIC) throw new Error('Файл не є резервною копією MultiFrame');

  const salt = Buffer.from(container.salt, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(password, salt), Buffer.from(container.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(container.tag, 'base64'));

  try {
    const plain = Buffer.concat([
      decipher.update(Buffer.from(container.data, 'base64')),
      decipher.final(), // GCM перевіряє тег: підміна або хибний пароль впаде тут
    ]);
    return JSON.parse(plain.toString('utf8')) as BackupPayload;
  } catch {
    throw new BackupPasswordError('Невірний пароль або пошкоджений файл резервної копії');
  }
}

export function restoreStorage(payload: BackupPayload, partitionDir: string): number {
  if (!payload.storage) return 0;
  return unpackDirectory(Buffer.from(payload.storage, 'base64'), partitionDir).length;
}

/** Порівняння без витоку часу — для перевірок цілісності поза GCM. */
export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
