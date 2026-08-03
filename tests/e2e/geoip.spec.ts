import { test, expect } from '@playwright/test';
import { launchApp, cleanup } from './helpers';

/**
 * Ф-4.6 / Ф-10.21 — панель GeoIP у Settings не має покриття Playwright-ом
 * ще ніде: перевіряє, що UI відкривається, ключ зберігається через
 * safeStorage і статус UI оновлюється відповідно. Свідомо БЕЗ реального
 * виклику download.maxmind.com — залежність від відповіді стороннього
 * сервера зробила б регресійний тест нестабільним у CI не з нашої вини
 * (зміна формату помилки MaxMind, тимчасове обмеження за IP тощо).
 * Шлях помилки завантаження перевірений вручну під час розробки
 * (STATE.md §7.3.1), але не тут.
 */
test('GeoIP settings panel saves a license key and updates status', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await window.getByRole('button', { name: 'GeoIP', exact: true }).click();

    await expect(window.getByText('not saved')).toBeVisible();
    await expect(window.getByText('not downloaded')).toBeVisible();

    const keyInput = window.getByPlaceholder('Paste your free GeoLite2 license key');
    await keyInput.fill('not-a-real-license-key');
    await window.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(window.getByText('Saved.')).toBeVisible();
    await expect(window.getByText('saved', { exact: true })).toBeVisible();

    // Кнопка стає доступною лише після збереження ключа (без нього
    // завантажувати нічого) — саме UI-умову й перевіряємо тут, не мережу.
    const downloadButton = window.getByRole('button', { name: 'Download / update database' });
    await expect(downloadButton).toBeEnabled();
  } finally {
    await cleanup(app, userDataDir);
  }
});
