import { test, expect } from '@playwright/test';
import { launchApp, cleanup } from './helpers';

/**
 * Ф-13.1 — після видалення розділу «Донат на ЗСУ» 2026-08-03 (рішення
 * користувача, STATE.md §10, ТЗ.md розділ 13) вікно «Підтримка» має
 * показувати лише «Підтримати проєкт», без слідів видаленого розділу.
 */
test('Support panel shows only the project donation section', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await window.getByRole('button', { name: 'Support', exact: true }).click();

    await expect(window.getByText('Support the project')).toBeVisible();
    await expect(window.getByText('bc1q6zwx4q9andwpe08rgdhgu8qj8angt5gf9gws74')).toBeVisible();
    await expect(window.getByText('Donate to the Armed Forces of Ukraine')).toHaveCount(0);
    await expect(window.getByText(/67th Separate Mechanized Brigade/)).toHaveCount(0);

    // Ф-13.22/13.24 — офіційний сайт, лише через shell:openExternal.
    await expect(window.getByRole('button', { name: /multiframe\.app/ })).toBeVisible();
  } finally {
    await cleanup(app, userDataDir);
  }
});
