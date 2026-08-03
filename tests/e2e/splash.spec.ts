import { test, expect } from '@playwright/test';
import { launchApp, cleanup } from './helpers';

/**
 * Рішення користувача 2026-08-03 — логотип на старті, що з'являється й
 * поступово зникає (Splash.tsx, ~1.8с CSS-анімація, theme.css).
 *
 * Знайдено під час вимірювання НФ-1.1 (perf.spec.ts): без `pointer-events:
 * none` непрозорий сплеш ФІЗИЧНО блокував клік по кнопках Launcher на
 * більшу частину своєї анімації — Playwright чекав, доки ціль кліку не
 * перестане бути затуленою, точно так само чекав би й нетерплячий
 * користувач. Бюджет `perf.spec.ts` (<5с) заскочив би і в зламаному, і в
 * справному стані — замалий запас, щоб надійно зловити регресію, тому
 * окремий тест саме на це, з жорсткішим власним бюджетом.
 */
test('the startup splash never blocks clicking through the Launcher, even while still visible', async () => {
  const { app, window, userDataDir } = await launchApp();
  try {
    // Клік одразу, без штучного очікування — це і є суть перевірки:
    // сплеш ще майже напевно на екрані (анімація ~1.8с).
    const clickedAt = Date.now();
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();
    await expect(window.getByText('Enter an address to start')).toBeVisible();
    const elapsedMs = Date.now() - clickedAt;

    // Непрозора фаза анімації сама по собі триває ~900мс (20%–70% з 1.8с).
    // Реальна обробка кліків без блокування вкладається в частку секунди;
    // 1500мс — щедрий запас під CI, який зловив би регресію (~1.5-2с зверху),
    // не зловлену б loose-бюджетом perf.spec.ts.
    expect(elapsedMs).toBeLessThan(1500);
  } finally {
    await cleanup(app, userDataDir);
  }
});
