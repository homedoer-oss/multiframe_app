import { test, expect } from '@playwright/test';
import { launchApp, cleanup, serveOnce } from './helpers';

/**
 * НФ-1.5 / НФ-1.3 (STATE.md §7.5) — присипляння неактивного фрейму й
 * відновлення при фокусі. Пороги передаються через env — 10 хв/60 с
 * живим прогоном ніхто чекати не буде.
 */
test('an unfocused frame sleeps after the idle threshold and wakes on click', async () => {
  const { app, window, userDataDir } = await launchApp({
    MF_SLEEP_AFTER_MS: '3000',
    MF_SLEEP_SWEEP_INTERVAL_MS: '1000',
  });
  const a = await serveOnce('frame A content');
  const b = await serveOnce('frame B content');
  try {
    await window.getByRole('button', { name: '2', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    const addressInputs = window.getByPlaceholder('Address');
    await expect(addressInputs).toHaveCount(2);

    await addressInputs.first().click();
    await addressInputs.first().fill(`http://127.0.0.1:${a.port}/`);
    await addressInputs.first().press('Enter');

    await addressInputs.last().click();
    await addressInputs.last().fill(`http://127.0.0.1:${b.port}/`);
    await addressInputs.last().press('Enter');

    await expect(window.getByText('Enter an address to start')).toHaveCount(0);

    // Фокус на першій комірці виключає ЇЇ зі сну (this.focused у
    // Workspace.sweepSleepCandidates). Клік по полю адреси теж активує
    // фрейм: onMouseDown стоїть на контейнері FramePlaceholder і охоплює
    // всю комірку, включно з адресним рядком.
    await addressInputs.first().click();

    // Другу комірку НЕ чіпаємо — вона має заснути після MF_SLEEP_AFTER_MS.
    await expect(window.getByText('Enter an address to start')).toHaveCount(1, { timeout: 10_000 });

    // wake(): клік по приспаній комірці відновлює той самий URL.
    await addressInputs.last().click();
    await expect(window.getByText('Enter an address to start')).toHaveCount(0, { timeout: 10_000 });
  } finally {
    a.server.close();
    b.server.close();
    await cleanup(app, userDataDir);
  }
});
