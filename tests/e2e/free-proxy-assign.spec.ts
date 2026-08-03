import { test, expect } from '@playwright/test';
import { launchApp, cleanup } from './helpers';

/**
 * Ф-10.15/10.16 — кнопка «призначити профілю» на картках результатів
 * `FreeProxyPanel` (STATE.md §7.4, менший пробіл поряд із ручним вводом
 * у `ProfileManagerPanel`, вже покритим `proxy-assign.spec.ts`).
 *
 * Реальний прогін `proxy:discoverStart` вимагав би справжнього робочого
 * проксі, якого тут немає. Замість цього подія `proxy:discoveryResult`
 * надсилається напряму з головного процесу (`webContents.send`, той
 * самий механізм, що й насправді) — так само, як синтетичні одноразові
 * скрипти в розділі 6 STATE.md для гіпотез, які не можна ізолювати
 * через реальний UI.
 */
test('assigning a discovered free proxy to a profile from FreeProxyPanel works end to end', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await window.getByRole('button', { name: 'Free proxies', exact: true }).click();
    await window.getByRole('button', { name: 'I understand, continue' }).click();

    await app.evaluate(({ webContents }) => {
      const shell = webContents.getAllWebContents().find((wc) => wc.getURL().includes('renderer/index.html'));
      shell?.send('proxy:discoveryResult', {
        host: '203.0.113.10',
        port: 8080,
        mode: 'https',
        rejected: null,
        quality: {
          exitIp: '203.0.113.10',
          country: 'US',
          city: null,
          asn: 'AS64500',
          operator: 'Example Hosting',
          subnet: 'datacenter',
          anonymity: 'elite',
          latencyMs: 120,
          blacklists: [],
          score: 62,
          checkedAt: new Date().toISOString(),
        },
      });
    });

    await expect(window.getByText('203.0.113.10')).toBeVisible();
    await window.getByRole('button', { name: 'Assign to profile' }).click();
    // 203.0.113.10 (TEST-NET-3, RFC 5737) не резолвиться й не приймає
    // з'єднань — proxy:assign усередині чекає на повний таймаут
    // evaluateProxy() (10с, DEFAULT_PROBE.timeoutMs) перед тим, як
    // однаково призначити проксі (Ф-3.6). Реальна UX-плата за призначення
    // повільного/недосяжного проксі — до ~10с очікування без індикатора
    // прогресу; варте окремої задачі полірування, не блокує коректність.
    await expect(window.getByText('Assigned.')).toBeVisible({ timeout: 15_000 });
  } finally {
    await cleanup(app, userDataDir);
  }
});
