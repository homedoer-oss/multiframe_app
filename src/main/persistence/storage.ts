import { readdirSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, session } from 'electron';
import type { Profile } from '@shared/types';
import { log } from '../logging/logger';
import { partitionFor } from '../profile/ProfileManager';

/**
 * RECOMMENDATIONS §7 — дев'ять постійних профілів ростуть без обмежень:
 * кеш, Service Workers, IndexedDB. За місяці роботи це десятки гігабайт.
 */
export function partitionDir(profile: Profile): string | null {
  if (!profile.persistSession) return null; // in-memory партиція не має теки
  const dir = join(app.getPath('userData'), 'Partitions', `profile-${profile.id}`);
  return existsSync(dir) ? dir : null;
}

export function directorySize(dir: string): number {
  let total = 0;
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else total += stat.size;
    }
  };
  try {
    walk(dir);
  } catch (err) {
    log.warn({ code: 'storage.size_failed', dir, error: String(err) });
  }
  return total;
}

export function profileDiskUsage(profile: Profile): number {
  const dir = partitionDir(profile);
  return dir ? directorySize(dir) : 0;
}

/**
 * Вибіркове очищення. Кеш чиститься ОКРЕМО від cookies — це головне:
 * користувач має мати змогу звільнити місце, не втрачаючи авторизацій,
 * які і є активом (RECOMMENDATIONS §6).
 */
export async function clearCacheOnly(profile: Profile): Promise<void> {
  const ses = session.fromPartition(partitionFor(profile));
  await ses.clearCache();
  await ses.clearStorageData({ storages: ['cachestorage', 'shadercache'] });
  log.info({ code: 'storage.cache_cleared', profileId: profile.id });
}

/** Ф-5.8 — повне скидання даних зі збереженням налаштувань і ідентичності. */
export async function clearAll(profile: Profile): Promise<void> {
  const ses = session.fromPartition(partitionFor(profile));
  await ses.clearCache();
  await ses.clearStorageData();
  log.info({ code: 'storage.all_cleared', profileId: profile.id });
}

/**
 * Ф-5.3 — для профілю з вимкненим збереженням на диску не має лишатися
 * жодних залишків (критерій приймання 19). Перевіряється відсутністю теки.
 */
export function hasResidue(profile: Profile): boolean {
  if (profile.persistSession) return false;
  const dir = join(app.getPath('userData'), 'Partitions', `profile-${profile.id}`);
  return existsSync(dir);
}
