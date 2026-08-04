import { test, expect } from '@playwright/test';
import { launchApp, cleanup, serveOnce } from './helpers';

/**
 * Ф-3 — «за умови підключення через проксі» (запит користувача 2026-08-04):
 * поточна вихідна IP-адреса живої сесії показується маленьким шрифтом під
 * назвою профілю, АЛЕ лише коли профіль реально не в режимі 'direct'.
 *
 * `Frame.refreshExitIp()` (main) звіряється через `session.resolveProxy()`,
 * тож для 'direct' завжди null — без окремої перевірки в renderer.
 * Позитивний шлях (реальний робочий проксі → показ реальної IP) свідомо
 * не автоматизований: залежав би від реального вихідного мережевого
 * запиту до httpbin.org, а цей набір навмисно уникає такої залежності
 * (той самий принцип, що й free-proxy-assign.spec.ts — справжній робочий
 * проксі тут узяти нізвідки).
 */
test('exit IP is never shown for a direct-mode profile', async () => {
  const { app, window, userDataDir } = await launchApp();
  const { server, port } = await serveOnce('exit-ip probe');
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    const addressInput = window.getByPlaceholder('Address');
    await addressInput.click();
    await addressInput.fill(`http://127.0.0.1:${port}`);
    await addressInput.press('Enter');
    await window.waitForTimeout(1500);

    // Профіль лишається 'direct' (типово) — жодної IP під назвою профілю.
    await expect(window.getByTitle(/Current exit IP/)).toHaveCount(0);
  } finally {
    server.close();
    await cleanup(app, userDataDir);
  }
});
