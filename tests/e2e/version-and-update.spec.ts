import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { launchApp, cleanup } from './helpers';

const PKG_VERSION = (JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version: string }).version;

/**
 * Запит користувача 2026-08-04: версія продукту біля кнопки Settings,
 * і кнопка завантаження нової версії, коли вона є на GitHub.
 *
 * electron-updater (main/update/autoUpdater.ts) вимикається повністю поза
 * упакованим застосунком (`app.isPackaged`) — у цьому наборі завжди
 * `idle`, реальної мережевої перевірки не буде ніколи. Стан «available»
 * симулюється прямою відправкою update:status у shell webContents, тим
 * самим методом, що й free-proxy-assign.spec.ts для discoverStart.
 */
test('shows the current app version next to Settings', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    await expect(window.getByText(`v${PKG_VERSION}`)).toBeVisible();
  } finally {
    await cleanup(app, userDataDir);
  }
});

test('shows a download button linking to the GitHub release when an update is available', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    await expect(window.getByRole('button', { name: /Download v/ })).toHaveCount(0);

    await app.evaluate(({ webContents }) => {
      const shell = webContents.getAllWebContents().find((wc) => wc.getURL().includes('renderer/index.html'));
      shell?.send('update:status', { state: 'available', version: '9.9.9' });
    });

    // Не клікаємо — shell.openExternal() дійсно відкрив би браузер на
    // машині; той самий підхід, що й support-panel.spec.ts.
    await expect(window.getByRole('button', { name: 'Download v9.9.9' })).toBeVisible();
  } finally {
    await cleanup(app, userDataDir);
  }
});
