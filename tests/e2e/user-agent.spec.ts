import { test, expect, type ElectronApplication } from '@playwright/test';
import { launchApp, cleanup, serveOnce } from './helpers';

/**
 * Запит користувача 2026-08-05 — ручний/автоматичний вибір User-Agent зі
 * списку популярних (UA_PRESETS, constants.ts — свідомо лише Chromium-
 * сумісні: Windows Chrome/Edge/Opera, рішення користувача обговорене
 * окремо, щоб не зламати узгодженість з Client Hints і реальним рушієм).
 */
function evalInTab<T>(app: ElectronApplication, url: string, script: string): Promise<T> {
  return app.evaluate(
    ({ webContents }, args) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL() === args.url);
      if (!wc) throw new Error(`no webContents with url ${args.url}`);
      return wc.executeJavaScript(args.script);
    },
    { url, script },
  );
}

test('manually switching User-Agent to Edge changes both the UA string and Client Hints brand after reload', async () => {
  const { app, window, userDataDir } = await launchApp();
  const { server, port } = await serveOnce('ua probe');
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    const url = `http://127.0.0.1:${port}/`;
    const addressInput = window.getByPlaceholder('Address');
    await addressInput.click();
    await addressInput.fill(url);
    await addressInput.press('Enter');
    await window.waitForTimeout(1500);

    // «Авто» тепер сам випадково обирає популярний пресет (включно з
    // Edge/Opera, той самий принцип, що й решта профілю пристрою) — тож
    // початковий стан НЕ обов'язково "чистий" Chrome. Спершу фіксуємо
    // детермінований базис (Chrome), тоді перемикаємо на Edge й звіряємо
    // РІЗНИЦЮ, а не припущення про початковий стан.
    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await window.getByRole('button', { name: /User-Agent —/ }).click();
    await window.locator('select').first().selectOption('manual');
    await window.locator('select').nth(1).selectOption('chrome');
    await expect(window.getByText('Changed.', { exact: false })).toBeVisible();
    await window.getByRole('button', { name: 'Reload now' }).click();
    await window.waitForTimeout(500);

    const asChrome = await evalInTab<string>(app, url, 'navigator.userAgent');
    expect(asChrome).not.toContain('Edg/');
    expect(asChrome).not.toContain('OPR/');

    await window.locator('select').nth(1).selectOption('edge');
    await window.getByRole('button', { name: 'Reload now' }).click();
    await window.getByTitle('Close').click();
    await window.waitForTimeout(1000);

    const after = await evalInTab<string>(app, url, 'navigator.userAgent');
    expect(after).toContain('Edg/');
    expect(after).not.toBe(asChrome);

    const brands = await evalInTab<string>(
      app,
      url,
      'navigator.userAgentData ? navigator.userAgentData.brands.map(b => b.brand).join(",") : ""',
    );
    expect(brands).toContain('Microsoft Edge');
    expect(brands).not.toContain('Google Chrome');
  } finally {
    server.close();
    await cleanup(app, userDataDir);
  }
});

/**
 * Запит користувача 2026-08-05 (окремий, того ж дня): усі пресети раніше
 * завжди віддавали ОДНУ й ту саму версію (фактичну версію рушія) — тепер
 * ручний вибір дозволяє 2-3 останні версії (UA_VERSION_OFFSETS: 0/1/2
 * мажорних версій назад). Перевіряє САМЕ це: зсув 2 дає мажорну версію
 * рівно на 2 менше за зсув 0 — не довільне число, а точно прогнозований
 * результат від фактичного `process.versions.chrome` рушія.
 */
test('choosing an older version offset lowers the major version by exactly that amount', async () => {
  const { app, window, userDataDir } = await launchApp();
  const { server, port } = await serveOnce('ua version probe');
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    const url = `http://127.0.0.1:${port}/`;
    const addressInput = window.getByPlaceholder('Address');
    await addressInput.click();
    await addressInput.fill(url);
    await addressInput.press('Enter');
    await window.waitForTimeout(1500);

    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await window.getByRole('button', { name: /User-Agent —/ }).click();
    await window.locator('select').first().selectOption('manual');
    await window.locator('select').nth(1).selectOption('chrome');
    await window.locator('select').nth(2).selectOption('0');
    await window.getByRole('button', { name: 'Reload now' }).click();
    await window.waitForTimeout(500);

    const latest = await evalInTab<string>(app, url, 'navigator.userAgent');
    const latestMajor = Number(latest.match(/Chrome\/(\d+)/)?.[1]);
    expect(Number.isNaN(latestMajor)).toBe(false);

    await window.locator('select').nth(2).selectOption('2');
    await window.getByRole('button', { name: 'Reload now' }).click();
    await window.getByTitle('Close').click();
    await window.waitForTimeout(1000);

    const twoBack = await evalInTab<string>(app, url, 'navigator.userAgent');
    const twoBackMajor = Number(twoBack.match(/Chrome\/(\d+)/)?.[1]);
    expect(twoBackMajor).toBe(latestMajor - 2);

    // Client Hints мусить синхронно відображати ту саму зсунуту версію,
    // не фактичну версію рушія — інакше сам собі суперечив би.
    const brandVersion = await evalInTab<string>(
      app,
      url,
      `navigator.userAgentData ? navigator.userAgentData.brands.find(b => b.brand === 'Google Chrome')?.version : ''`,
    );
    expect(brandVersion).toBe(String(twoBackMajor));
  } finally {
    server.close();
    await cleanup(app, userDataDir);
  }
});

test('a profile with no open tab shows a clear hint instead of a no-op reload button after changing User-Agent', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await window.getByRole('button', { name: /User-Agent —/ }).click();
    await window.locator('select').first().selectOption('manual');
    await window.locator('select').nth(1).selectOption('opera');

    await expect(window.getByText(/no open page yet/)).toBeVisible();
    await expect(window.getByRole('button', { name: 'Reload now' })).toHaveCount(0);
  } finally {
    await cleanup(app, userDataDir);
  }
});
