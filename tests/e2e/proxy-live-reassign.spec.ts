import { test, expect } from '@playwright/test';
import { launchApp, cleanup, serveOnce } from './helpers';

/**
 * Знайдено 2026-08-04 через живий скріншот користувача: панель профілю
 * показувала призначену адресу проксі, а сайт визначення IP у вже
 * відкритому фреймі бачив РЕАЛЬНУ адресу користувача.
 *
 * Причина — `proxy:assign` (proxyHandlers.ts) писав нове правило лише в
 * config.json; `session.setProxy()` живої сесії вже відкритого фрейму
 * ніколи не викликався повторно (лише один раз, при createFrame() у
 * Workspace.ts) — тобто фрейм, відкритий ДО перепризначення, тихо продовжував
 * ганяти трафік по старих proxyRules аж до перезапуску застосунку. Це пряме
 * порушення власної специфікації (Ф-3.6 ТЗ.md: "Зміна проксі застосовується
 * після перезавантаження фрейму").
 *
 * Правила без ",direct" (kill-switch, Ф-3.7/Ф-3.8) роблять тест
 * детермінованим: недосяжний SOCKS5 після перепризначення й перезавантаження
 * мусить провалити навігацію помилкою проксі, а не мовчки пройти напряму.
 */
test('reassigning a proxy to an already-open frame actually reroutes it after reload', async () => {
  const { app, window, userDataDir } = await launchApp();
  const { server, port } = await serveOnce('reassign probe');
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    // Крок 1 — фрейм відкривається, поки проксі 'direct': сторінка
    // завантажується напряму без проблем. Вміст WebContentsView не є
    // частиною DOM оболонки (Playwright не бачить його як окрему Page —
    // isolation.spec.ts), тож перевіряємо відсутність банера помилки в
    // оболонці, а не текст самої сторінки.
    const addressInput = window.getByPlaceholder('Address');
    await addressInput.click();
    await addressInput.fill(`http://127.0.0.1:${port}`);
    await addressInput.press('Enter');
    await window.waitForTimeout(1500);
    await expect(window.getByText('Proxy unavailable')).toHaveCount(0);

    // Крок 2 — перепризначаємо проксі на недосяжну адресу ТОМУ Ж фрейму,
    // не перестворюючи його і не перезапускаючи застосунок.
    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await window.getByRole('button', { name: /Proxy — Direct/ }).click();
    await window.locator('select').selectOption('socks5');
    await window.getByPlaceholder('Host').fill('127.0.0.1');
    // Зарезервований порт — гарантовано ECONNREFUSED, детерміновано.
    await window.getByPlaceholder('Port').fill('1');
    await window.getByRole('button', { name: 'Assign to this profile' }).click();
    await expect(window.getByText('Assigned.')).toBeVisible();

    await window.getByRole('button', { name: 'Reload now' }).click();
    await window.getByTitle('Close').click();

    // Той самий локальний сервер, лише перезавантаження. Без фіксу правила
    // проксі живої сесії не мінялися б узагалі, і ця сторінка знову
    // відкрилась би напряму без жодної помилки.
    await expect(window.getByText('Proxy unavailable')).toBeVisible({ timeout: 15_000 });
  } finally {
    server.close();
    await cleanup(app, userDataDir);
  }
});
