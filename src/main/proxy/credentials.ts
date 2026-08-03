import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';
import { log } from '../logging/logger';

/**
 * Ф-5.5 — паролі проксі зберігаються виключно через захищене сховище Windows
 * (safeStorage → DPAPI). Відкритий текст не потрапляє у жоден файл,
 * включно з config.json і журналом (критерій приймання 20).
 *
 * ОБМ-4 — шифротекст прив'язаний до облікового запису Windows і машини.
 * Перенесення профілю на інший ПК робить розшифрування неможливим,
 * тому помилка обробляється як штатний сценарій, а не як збій.
 */
type Vault = Record<string, string>;

function vaultPath(): string {
  return join(app.getPath('userData'), 'proxy-credentials.bin');
}

function readVault(): Vault {
  const path = vaultPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Vault;
  } catch (err) {
    log.error({ code: 'credentials.read_failed', error: String(err) });
    return {};
  }
}

function writeVault(vault: Vault): void {
  const path = vaultPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(vault), 'utf8');
}

export function isVaultAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function setPassword(profileId: string, password: string): boolean {
  if (!isVaultAvailable()) {
    log.error({ code: 'credentials.unavailable', profileId });
    return false;
  }
  const vault = readVault();
  vault[profileId] = safeStorage.encryptString(password).toString('base64');
  writeVault(vault);
  return true;
}

export function getPassword(profileId: string): string | null {
  const encrypted = readVault()[profileId];
  if (!encrypted || !isVaultAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch (err) {
    // ОБМ-4: найімовірніше профіль перенесено на іншу машину чи обліковий запис.
    log.warn({ code: 'credentials.decrypt_failed', profileId, error: String(err) });
    return null;
  }
}

export function clearPassword(profileId: string): void {
  const vault = readVault();
  delete vault[profileId];
  writeVault(vault);
}
