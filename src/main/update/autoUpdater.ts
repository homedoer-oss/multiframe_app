import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateStatus } from '@shared/types';
import { log } from '../logging/logger';

let current: UpdateStatus = { state: 'idle' };
let emitStatus: ((status: UpdateStatus) => void) | null = null;

function setStatus(status: UpdateStatus): void {
  current = status;
  emitStatus?.(status);
}

export function getUpdateStatus(): UpdateStatus {
  return current;
}

/**
 * НФ-3.2 — автооновлення через GitHub Releases (рішення користувача
 * 2026-08-03, `electron-builder.yml` `publish`).
 *
 * Працює лише в упакованому застосунку: `electron-updater` читає
 * `app-update.yml`, який `electron-builder` генерує тільки під час
 * `npm run dist`, а не `npm run dev` — у розробницькому режимі файла
 * немає, і виклик `checkForUpdates()` впав би з помилкою. `app.isPackaged`
 * тут не тимчасовий обхід, а постійна умова: перевірка оновлень у
 * невстановленій копії не має сенсу.
 *
 * `autoInstallOnAppQuit: false` — навмисно: встановлення оновлення без
 * явної дії користувача (кнопка в оболонці) означало б непередбачувану
 * заміну файлів під час звичайного закриття застосунку.
 */
export function initAutoUpdater(onStatus: (status: UpdateStatus) => void): void {
  emitStatus = onStatus;
  if (!app.isPackaged) {
    log.info({ code: 'update.skipped_dev_mode' });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    log.info({ code: 'update.available', version: info.version });
    setStatus({ state: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => setStatus({ state: 'not-available' }));
  autoUpdater.on('download-progress', (progress) => {
    setStatus({ state: 'downloading', percent: Math.round(progress.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    log.info({ code: 'update.downloaded', version: info.version });
    setStatus({ state: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    log.error({ code: 'update.error', error: String(err) });
    setStatus({ state: 'error', message: err.message });
  });

  void autoUpdater.checkForUpdates();
}

export function checkForUpdatesNow(): void {
  if (!app.isPackaged) return;
  void autoUpdater.checkForUpdates();
}

export function installUpdateNow(): void {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall();
}
