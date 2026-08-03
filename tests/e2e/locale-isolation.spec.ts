import { test, expect } from '@playwright/test';
import { launchApp, cleanup, serveOnce } from './helpers';

/**
 * Критерії приймання №21 і №23 (ТЗ.md §15, docs/ACCEPTANCE-MATRIX.md) —
 * жодного разу не прогнані раніше, хоча обидві поведінки задокументовані
 * як інваріанти (STATE.md §5.7, Ф-8.3, Ф-8.6): зміна мови інтерфейсу не
 * перезавантажує відкриті фрейми (21) і не змінює navigator.language /
 * navigator.languages жодного профілю (23).
 *
 * Доступ до вмісту вкладки — та сама техніка, що й isolation.spec.ts:
 * Playwright не бачить WebContentsView як окрему Page, тому напряму через
 * webContents.getAllWebContents() у головному процесі.
 */
test('switching interface language does not reload frames or change navigator.language of any profile', async () => {
  const { app, window, userDataDir } = await launchApp();
  const { server, port } = await serveOnce('locale probe');
  const url = `http://127.0.0.1:${port}/`;
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    const addressInput = window.getByPlaceholder('Address');
    await addressInput.click();
    await addressInput.fill(url);
    await addressInput.press('Enter');
    await expect(window.getByText('Enter an address to start')).toHaveCount(0);
    await window.waitForTimeout(1500);

    const evalInTab = <T,>(script: string): Promise<T> =>
      app.evaluate(
        ({ webContents }, args) => {
          const wc = webContents.getAllWebContents().find((w) => w.getURL() === args.url);
          if (!wc) throw new Error(`no webContents with url ${args.url}`);
          return wc.executeJavaScript(args.script);
        },
        { url, script },
      );

    const languageBefore = await evalInTab<string>('navigator.language');
    const languagesBefore = await evalInTab<readonly string[]>('navigator.languages');
    // Маркер, що переживе лише якщо сторінка НЕ перезавантажилась (Ф-8.3).
    await evalInTab('window.__localeSwitchMarker = "still-here"');

    // Ф-8.3 — перемикання мови без перезапуску; UI-текст сатне доказом,
    // що переклад узагалі застосувався (інакше тест міг би хибно пройти
    // з "нічого не відбулось").
    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await window.getByRole('button', { name: 'Language', exact: true }).click();
    await window.getByRole('button', { name: 'Українська', exact: true }).click();
    // Кнопка закриття — "✕", а не title="Закрити": accessible name бере
    // текстовий вміст, а title лише як останній резерв.
    await window.getByRole('button', { name: '✕', exact: true }).click();
    await expect(window.getByRole('button', { name: 'Налаштування', exact: true })).toBeVisible();

    // Ф-8.6 / критерій 23 — мова UI не мала протекти в жоден профіль.
    const languageAfter = await evalInTab<string>('navigator.language');
    const languagesAfter = await evalInTab<readonly string[]>('navigator.languages');
    expect(languageAfter).toBe(languageBefore);
    expect(languagesAfter).toEqual(languagesBefore);

    // Критерій 21 — маркер вижив, тобто вкладку не перезавантажили.
    const marker = await evalInTab<string>('window.__localeSwitchMarker');
    expect(marker).toBe('still-here');
  } finally {
    server.close();
    await cleanup(app, userDataDir);
  }
});
