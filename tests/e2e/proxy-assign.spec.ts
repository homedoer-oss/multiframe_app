import { test, expect } from '@playwright/test';
import { launchApp, cleanup } from './helpers';

/**
 * Ф-10.15/Ф-10.16 — backend (`proxy:evaluate`/`proxy:assign`) існував і
 * був покритий тестами, але жоден компонент renderer його не викликав
 * (STATE.md §7.4, знайдено 2026-08-02). Це перший тест, що проганяє
 * ручне призначення проксі профілю через реальний UI, а не напряму IPC.
 */
test('manually assigning and clearing a proxy through ProfileManagerPanel works end to end', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    // Ф-6 — вкладка «Profiles» типова, окремого кліку не потрібно.
    await expect(window.getByRole('button', { name: /Proxy — Direct/ })).toBeVisible();

    await window.getByRole('button', { name: /Proxy — Direct/ }).click();
    await window.locator('select').selectOption('socks5');
    await window.getByPlaceholder('Host').fill('127.0.0.1');
    // Порт 1 — зарезервований, нічого не слухає: детермінований «недосяжний».
    await window.getByPlaceholder('Port').fill('1');

    // Assign не вимагає попереднього успішного Test (Ф-3.6 — kill-switch
    // діє на рівні правил маршрутизації, не цієї перевірки).
    await window.getByRole('button', { name: 'Assign to this profile' }).click();
    await expect(window.getByText('Assigned.')).toBeVisible();
    await expect(window.getByRole('button', { name: /Proxy — 127\.0\.0\.1:1/ })).toBeVisible();

    // Test окремо підтверджує шлях помилки для недосяжного проксі.
    await window.getByRole('button', { name: 'Test', exact: true }).click();
    await expect(window.getByText('Could not connect through this proxy.')).toBeVisible({ timeout: 15_000 });

    // Повернення на "Direct" так само йде через proxy:assign (не окремий шлях)
    // і мусить очистити exitCountry/host/port на бекенді.
    await window.locator('select').selectOption('direct');
    await window.getByRole('button', { name: 'Assign to this profile' }).click();
    await expect(window.getByRole('button', { name: /Proxy — Direct/ })).toBeVisible();
  } finally {
    await cleanup(app, userDataDir);
  }
});
