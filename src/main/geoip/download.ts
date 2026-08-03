import { get } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { extract } from 'tar';
import { log } from '../logging/logger';
import { GEOIP_EDITIONS, buildDownloadUrl, type GeoipEdition } from './pure';

export { GEOIP_EDITIONS, buildDownloadUrl, type GeoipEdition };

/**
 * Ф-4.6 / Ф-10.21 — локальна база MaxMind GeoLite2, обрана явно замість
 * зовнішнього сервісу (рішення користувача 2026-08-02). ASN-видання дає
 * ASN/оператора, City — країну й місто. Обидва потрібні для повного
 * `GeoAsnRecord`.
 */
export function geoipDir(): string {
  return join(app.getPath('userData'), 'geoip');
}

export function mmdbPath(edition: GeoipEdition): string {
  return join(geoipDir(), `${edition}.mmdb`);
}

export function databasesPresent(): boolean {
  return GEOIP_EDITIONS.every((e) => existsSync(mmdbPath(e)));
}

/** Рекурсивний пошук `.mmdb` — MaxMind пакує файл у датовану підтеку всередині архіву. */
function findMmdb(dir: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findMmdb(full);
      if (nested) return nested;
    } else if (entry.name.endsWith('.mmdb')) {
      return full;
    }
  }
  return null;
}

function fetchAndExtract(url: string, extractDir: string, redirectsLeft = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = get(url, (res: IncomingMessage) => {
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        fetchAndExtract(res.headers.location, extractDir, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (status === 401 || status === 403) {
        res.resume();
        reject(new Error('MaxMind відхилив ліцензійний ключ'));
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`MaxMind повернув код ${status}`));
        return;
      }

      const unpack = extract({ cwd: extractDir, gzip: true });
      res.pipe(unpack);
      unpack.on('error', reject);
      unpack.on('close', () => resolve());
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error('таймаут завантаження MaxMind')));
  });
}

async function downloadEdition(edition: GeoipEdition, licenseKey: string): Promise<void> {
  const dir = geoipDir();
  mkdirSync(dir, { recursive: true });
  const tmpDir = join(dir, `.tmp-${edition}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    await fetchAndExtract(buildDownloadUrl(edition, licenseKey), tmpDir);
    const found = findMmdb(tmpDir);
    if (!found) throw new Error(`Архів ${edition} не містить .mmdb файл`);
    copyFileSync(found, mmdbPath(edition));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export interface DownloadOutcome {
  ok: boolean;
  error?: string;
  updatedAt?: string;
}

/**
 * Ф-10.20 — межа вихідного трафіку: цей запит іде лише до офіційного
 * `download.maxmind.com` з ключем, який користувач сам ввів. Жодні дані
 * профілю, проксі чи статистики використання сюди не потрапляють.
 */
export async function downloadAllDatabases(licenseKey: string): Promise<DownloadOutcome> {
  try {
    for (const edition of GEOIP_EDITIONS) {
      await downloadEdition(edition, licenseKey);
    }
    const updatedAt = new Date().toISOString();
    log.info({ code: 'geoip.databases_updated', editions: GEOIP_EDITIONS });
    return { ok: true, updatedAt };
  } catch (err) {
    log.error({ code: 'geoip.download_failed', error: String(err) });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
