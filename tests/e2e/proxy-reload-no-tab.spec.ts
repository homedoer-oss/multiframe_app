import { test, expect } from '@playwright/test';
import { launchApp, cleanup } from './helpers';

/**
 * Знайдено 2026-08-04 через живий досвід користувача: «Reload now» «ні на
 * що не впливає», і проксі ніби «зберігається лише при увімкненому
 * чекбоксу». Насправді — та сама категорія бага, що й DevTools/Find без
 * активної вкладки (розділ 9 STATE.md): якщо профіль ще НІ РАЗУ не
 * навігований адресним рядком фрейму (типовий стан щойно створеного
 * профілю, Ф-1.7 — вкладка ліниво, не заводиться наперед),
 * `withActiveWebContents()` на боці main мовчки нічого не робить — не тому,
 * що проксі не зберігся (він зберігається завжди, незалежно від чекбокса),
 * а тому, що нема чого перезавантажувати.
 */
test('assigning a proxy to a profile with no open tab shows a clear hint instead of a no-op reload button', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    // Жодної навігації в самому фреймі — одразу в Settings.
    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await window.getByRole('button', { name: /Proxy — Direct/ }).click();
    await window.locator('select').selectOption('https');
    await window.getByPlaceholder('Host').fill('203.0.113.10'); // TEST-NET-3, не резолвиться
    await window.getByPlaceholder('Port').fill('8080');
    await window.getByRole('button', { name: 'Assign to this profile' }).click();

    await expect(window.getByText(/no open page yet/)).toBeVisible({ timeout: 15_000 });
    await expect(window.getByRole('button', { name: 'Reload now' })).toHaveCount(0);
  } finally {
    await cleanup(app, userDataDir);
  }
});

/**
 * Дзеркальний випадок — Settings відкрито ПІСЛЯ того, як вкладка вже
 * стабілізувалась: жодної нової frame:state події для неї вже не буде,
 * тож `hasTab` мусить прийти з одноразового знімка (`workspace:tabPresence`)
 * на монтуванні панелі, а не лише з підписки на майбутні події.
 */
test('a tab opened before Settings was shown still gets a working Reload now button', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    const addressInput = window.getByPlaceholder('Address');
    await addressInput.click();
    await addressInput.fill('https://example.com');
    await addressInput.press('Enter');
    await window.waitForTimeout(1500); // дати вкладці стабілізуватись до відкриття Settings

    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await window.getByRole('button', { name: /Proxy — Direct/ }).click();
    await window.locator('select').selectOption('https');
    await window.getByPlaceholder('Host').fill('203.0.113.10');
    await window.getByPlaceholder('Port').fill('8080');
    await window.getByRole('button', { name: 'Assign to this profile' }).click();

    await expect(window.getByText('Assigned.')).toBeVisible({ timeout: 15_000 });
    await expect(window.getByRole('button', { name: 'Reload now' })).toBeVisible();
  } finally {
    await cleanup(app, userDataDir);
  }
});
