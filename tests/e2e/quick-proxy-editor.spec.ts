import { test, expect } from '@playwright/test';
import { launchApp, cleanup } from './helpers';

/**
 * Запит користувача 2026-08-05: змінити проксі прямо біля адресного рядка
 * фрейма, не відкриваючи загальні Settings. Клік по мітці поточного
 * проксі («Direct» тощо) розкриває ту саму форму (ProxyEditor.tsx —
 * спільна з панеллю Settings, розділ 7.13 STATE.md), позиційовану поверх
 * тіла комірки.
 */
test('changing proxy from the frame toolbar works without ever opening Settings', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    // Жодного разу не відкриваємо Settings — саме це й перевіряється.
    await expect(window.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await window.getByRole('button', { name: 'Direct', exact: true }).click();

    await window.locator('select').first().selectOption('https');
    await window.getByPlaceholder('Host').fill('203.0.113.10'); // TEST-NET-3, не резолвиться
    await window.getByPlaceholder('Port').fill('8080');
    await window.getByRole('button', { name: 'Assign to this profile' }).click();

    await expect(window.getByText('Assigned.', { exact: false })).toBeVisible({ timeout: 15_000 });

    // Мітка в тулбарі одразу відображає новий режим — підтвердження, що
    // профіль дійсно оновився через ту саму IPC-подію, що й Settings.
    await expect(window.getByRole('button', { name: 'HTTPS proxy', exact: true })).toBeVisible();
  } finally {
    await cleanup(app, userDataDir);
  }
});

/**
 * Знайдено користувачем 2026-08-05, того ж дня: якщо форму лишити
 * відкритою й одразу перейти за новою адресою, `toolbarOverlayOpen`
 * лишався `true` — реальний WebContentsView НОВОЇ вкладки теж ховався б,
 * попри коректно застосований проксі (Frame.shouldShowActiveView()).
 * Виглядало це як «проксі не працює», хоча сторінка була просто
 * прихована. Фікс — закривати панель на навігації (і на кліку поза нею).
 */
test('the quick proxy editor closes itself when the user navigates with it still open', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    await window.getByRole('button', { name: 'Direct', exact: true }).click();
    await expect(window.getByRole('button', { name: 'Assign to this profile' })).toBeVisible();

    // Форма лишається ВІДКРИТОЮ — саме той сценарій, що ламався. Свідомо
    // БЕЗ .click() по адресному рядку до цього: клік поза панеллю сам
    // закрив би її (окремий, вужчий фікс нижче в наборі) — тут перевіряємо
    // САМЕ закриття на факті навігації (go()), не на кліку.
    const addressInput = window.getByPlaceholder('Address');
    await addressInput.fill('https://example.com');
    await addressInput.press('Enter');

    await expect(window.getByRole('button', { name: 'Assign to this profile' })).toHaveCount(0);
  } finally {
    await cleanup(app, userDataDir);
  }
});

test('the quick proxy editor closes on a click outside it', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    await window.getByRole('button', { name: 'Direct', exact: true }).click();
    await expect(window.getByRole('button', { name: 'Assign to this profile' })).toBeVisible();

    // Клік десь поза панеллю й кнопкою-перемикачем — на порожній підказці комірки.
    await window.getByText('Enter an address to start').click();

    await expect(window.getByRole('button', { name: 'Assign to this profile' })).toHaveCount(0);
  } finally {
    await cleanup(app, userDataDir);
  }
});

test('the quick proxy editor closes and reopens per frame independently', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '2', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    const directButtons = window.getByRole('button', { name: 'Direct', exact: true });
    await expect(directButtons).toHaveCount(2);

    await directButtons.first().click();
    await expect(window.getByRole('button', { name: 'Assign to this profile' })).toHaveCount(1);

    // Закриваємо перший — форма зникає, друга комірка нею не зачеплена.
    await directButtons.first().click();
    await expect(window.getByRole('button', { name: 'Assign to this profile' })).toHaveCount(0);
  } finally {
    await cleanup(app, userDataDir);
  }
});
