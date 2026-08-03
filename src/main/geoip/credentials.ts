import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';
import { log } from '../logging/logger';

/**
 * Ліцензійний ключ MaxMind — теж credential (дає доступ до облікового
 * запису користувача на maxmind.com), тому той самий підхід, що й паролі
 * проксі (`proxy/credentials.ts`, Ф-5.5): лише через safeStorage, ніколи
 * у відкритому вигляді в config.json.
 */
function vaultPath(): string {
  return join(app.getPath('userData'), 'geoip-credentials.bin');
}

export function isVaultAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function setLicenseKey(key: string): boolean {
  if (!isVaultAvailable()) {
    log.error({ code: 'geoip.credentials_unavailable' });
    return false;
  }
  const path = vaultPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, safeStorage.encryptString(key).toString('base64'), 'utf8');
  return true;
}

export function getLicenseKey(): string | null {
  const path = vaultPath();
  if (!existsSync(path) || !isVaultAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(readFileSync(path, 'utf8'), 'base64'));
  } catch (err) {
    // ОБМ-4: те саме застереження, що й для паролів проксі — шифротекст
    // прив'язаний до облікового запису Windows і машини.
    log.warn({ code: 'geoip.decrypt_failed', error: String(err) });
    return null;
  }
}

export function hasLicenseKey(): boolean {
  return existsSync(vaultPath());
}

export function clearLicenseKey(): void {
  const path = vaultPath();
  if (existsSync(path)) unlinkSync(path);
}
