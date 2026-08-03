import { test, expect } from '@playwright/test';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp, cleanup, serveOnce } from './helpers';

/**
 * Ф-7 (ANALYSIS.md §Етап 7) — базова матриця приймання через Playwright
 * for Electron: перший запуск (АРХ-1), вибір кількості профілів (Ф-1.1),
 * ліниве створення фреймів (Ф-1.7).
 */

test('launcher shows profile picker and launches a workspace grid', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await expect(window.getByRole('heading', { name: /how many profiles/i })).toBeVisible();

    await window.getByRole('button', { name: '3', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    // Ф-1.7 — свіжий запуск без відновлення: усі комірки порожні,
    // жодна WebContentsView не завантажує реальну сторінку.
    await expect(window.getByText('Enter an address to start')).toHaveCount(3);
  } finally {
    await cleanup(app, userDataDir);
  }
});

test('navigating one cell loads a page while the others stay empty (Ф-1.7)', async () => {
  const { app, window, userDataDir } = await launchApp();
  const { server, port } = await serveOnce('e2e probe page');
  try {
    await window.getByRole('button', { name: '2', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    const addressInputs = window.getByPlaceholder('Address');
    await expect(addressInputs).toHaveCount(2);
    await expect(window.getByText('Enter an address to start')).toHaveCount(2);

    await addressInputs.first().click();
    await addressInputs.first().fill(`http://127.0.0.1:${port}/`);
    await addressInputs.first().press('Enter');

    // Лише ОДНА комірка мала відкрити вкладку — друга лишається лінивою.
    await expect(window.getByText('Enter an address to start')).toHaveCount(1);
  } finally {
    server.close();
    await cleanup(app, userDataDir);
  }
});

test('the shell footer (Settings button) is structurally reserved above the frame grid, never covered by it', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    // §5.9 — WebContentsView лягають НАД оболонкою за z-порядком; main
    // позиціонує їх точно за rect-ом, який виміряв registerCell() (АРХ-7).
    // Регресія: якщо grid-обгортка колись знову розтягнеться на всю
    // висоту вікна (як було до фіксу — `height: 100vh` без відступу),
    // footer із кнопкою Settings опиниться в зоні, куди main має право
    // поставити фрейм, і вкладка його фізично накриє.
    const gridBox = await window.getByTestId('workspace-grid').boundingBox();
    const footerBox = await window.getByTestId('shell-footer').boundingBox();
    if (!gridBox || !footerBox) throw new Error('grid or footer not found');

    expect(footerBox.y).toBeGreaterThanOrEqual(gridBox.y + gridBox.height - 1);

    await expect(window.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  } finally {
    await cleanup(app, userDataDir);
  }
});

test('closing the window with a loaded tab does not throw (Frame.dispose race, STATE.md §7.5)', async () => {
  const { app, window, userDataDir } = await launchApp();
  const { server, port } = await serveOnce('e2e probe page');
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    const addressInput = window.getByPlaceholder('Address');
    await addressInput.click();
    await addressInput.fill(`http://127.0.0.1:${port}/`);
    await addressInput.press('Enter');
    await expect(window.getByText('Enter an address to start')).toHaveCount(0);

    // closeTab()/sleep()/dispose() ідуть через Frame.closeView(), яке
    // перевіряє isDestroyed() перед removeChildView()/webContents.close() —
    // без цього window-all-closed після закриття вікна з живою вкладкою
    // кидав необроблений TypeError: Object has been destroyed, і через це
    // синхронний throw ОБРИВАВ обробник window-all-closed ДО app.quit() —
    // застосунок не крашився, а зависав назавжди (electronApp.close() це
    // не відтворює, тому закриваємо вікно напряму).
    await app.evaluate(({ BaseWindow }) => {
      BaseWindow.getAllWindows()[0]?.close();
    });
    await app.waitForEvent('close');

    const today = new Date().toISOString().slice(0, 10);
    const log = readFileSync(join(userDataDir, 'logs', `${today}.log`), 'utf8');
    expect(log).not.toContain('app.uncaught_exception');
    expect(log).not.toContain('Object has been destroyed');
  } finally {
    server.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});
