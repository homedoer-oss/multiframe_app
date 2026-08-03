import { test, expect, type ElectronApplication } from '@playwright/test';
import { launchApp, cleanup, serveOnce } from './helpers';

/**
 * Критерій приймання №2 (ТЗ.md §15) — document.cookie, Local Storage й
 * IndexedDB одного профілю недоступні з іншого, автоматизованим тестом.
 * Раніше ніде не перевірялось (docs/ACCEPTANCE-MATRIX.md) — ізоляція була
 * лише архітектурною гарантією (окремі `persist:profile-<id>` сесії), без
 * підтвердження.
 *
 * Playwright не бачить WebContentsView як окрему `Page` (app.windows()
 * повертає лише BaseWindow оболонки) — тому доступ до вмісту вкладки йде
 * через `webContents.getAllWebContents()` у головному процесі за URL, не
 * через звичайний `page.evaluate()`.
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

test('cookies, localStorage and IndexedDB of one profile are invisible to another', async () => {
  const { app, window, userDataDir } = await launchApp();
  const { server, port } = await serveOnce('isolation probe');
  const urlA = `http://127.0.0.1:${port}/a`;
  const urlB = `http://127.0.0.1:${port}/b`;
  try {
    await window.getByRole('button', { name: '2', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    const addressInputs = window.getByPlaceholder('Address');
    await addressInputs.first().click();
    await addressInputs.first().fill(urlA);
    await addressInputs.first().press('Enter');

    await addressInputs.last().click();
    await addressInputs.last().fill(urlB);
    await addressInputs.last().press('Enter');

    await expect(window.getByText('Enter an address to start')).toHaveCount(0);
    // Дати обом вкладкам осісти після навігації, перш ніж шукати їх
    // webContents за URL (той самий таймінг, що й perf.spec.ts).
    await window.waitForTimeout(1500);

    // Профіль A пише власні маркери.
    await evalInTab(app, urlA, "document.cookie = 'iso=A; path=/'; localStorage.setItem('iso', 'A');");
    await evalInTab(
      app,
      urlA,
      `new Promise((resolve, reject) => {
        const req = indexedDB.open('iso-db-a', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('s');
        req.onsuccess = () => { req.result.close(); resolve(true); };
        req.onerror = () => reject(req.error);
      })`,
    );

    // Профіль B пише СВОЇ маркери, з іншими значеннями.
    await evalInTab(app, urlB, "document.cookie = 'iso=B; path=/'; localStorage.setItem('iso', 'B');");
    await evalInTab(
      app,
      urlB,
      `new Promise((resolve, reject) => {
        const req = indexedDB.open('iso-db-b', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('s');
        req.onsuccess = () => { req.result.close(); resolve(true); };
        req.onerror = () => reject(req.error);
      })`,
    );

    const cookieInA = await evalInTab<string>(app, urlA, 'document.cookie');
    const cookieInB = await evalInTab<string>(app, urlB, 'document.cookie');
    expect(cookieInA).toContain('iso=A');
    expect(cookieInA).not.toContain('iso=B');
    expect(cookieInB).toContain('iso=B');
    expect(cookieInB).not.toContain('iso=A');

    const lsInA = await evalInTab<string | null>(app, urlA, "localStorage.getItem('iso')");
    const lsInB = await evalInTab<string | null>(app, urlB, "localStorage.getItem('iso')");
    expect(lsInA).toBe('A');
    expect(lsInB).toBe('B');

    const dbNamesInA = await evalInTab<string[]>(
      app,
      urlA,
      "indexedDB.databases().then(dbs => dbs.map(d => d.name))",
    );
    const dbNamesInB = await evalInTab<string[]>(
      app,
      urlB,
      "indexedDB.databases().then(dbs => dbs.map(d => d.name))",
    );
    expect(dbNamesInA).toContain('iso-db-a');
    expect(dbNamesInA).not.toContain('iso-db-b');
    expect(dbNamesInB).toContain('iso-db-b');
    expect(dbNamesInB).not.toContain('iso-db-a');
  } finally {
    server.close();
    await cleanup(app, userDataDir);
  }
});
