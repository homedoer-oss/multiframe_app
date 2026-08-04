import { test, expect } from '@playwright/test';
import { launchApp, cleanup } from './helpers';

/**
 * Нова ідея користувача 2026-08-04: замість порожнього білого вікна на
 * about:blank (щойно перестворений фрейм чи прогрів перед навігацією)
 * показувати статус проксі прямо у фреймі. `Frame.isBlankIdle()` (main)
 * ховає WebContentsView саме для цього стану — так само, як для помилки
 * (FrameError), — і оболонка показує статус замість порожнього view.
 */
test('a blank-idle frame shows proxy status instead of an empty white view', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    await window.getByRole('button', { name: 'Settings', exact: true }).click();

    // Перемикання чекбокса перестворює фрейм і відкриває порожню вкладку
    // (recreateFrame() -> openTab(), без адреси) — саме той сценарій.
    window.once('dialog', (dialog) => void dialog.accept());
    await window.getByRole('checkbox', { name: /Save session/ }).click();
    await window.waitForTimeout(500);

    // Профіль лишається 'direct' — статус проксі не показується, лише
    // звичайна підказка «введіть адресу» (без окремого мережевого запиту).
    await window.getByTitle('Close').click();
    await expect(window.getByText('Enter an address to start')).toBeVisible();

    // Тепер призначаємо недосяжний проксі й перезавантажуємо той самий
    // порожній фрейм — детермінований шлях «перевірка не вдалась».
    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await window.getByRole('button', { name: /Proxy — Direct/ }).click();
    await window.locator('select').selectOption('https');
    await window.getByPlaceholder('Host').fill('127.0.0.1');
    await window.getByPlaceholder('Port').fill('1'); // зарезервований порт, гарантовано недосяжний
    await window.getByRole('button', { name: 'Assign to this profile' }).click();
    await expect(window.getByText('Assigned.')).toBeVisible({ timeout: 15_000 });
    await window.getByRole('button', { name: 'Reload now' }).click();
    await window.getByTitle('Close').click();

    await expect(window.getByText('Could not verify the proxy')).toBeVisible({ timeout: 15_000 });
  } finally {
    await cleanup(app, userDataDir);
  }
});
