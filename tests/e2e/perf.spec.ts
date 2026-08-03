import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { launchApp, cleanup } from './helpers';

/**
 * НФ-1.3 (STATE.md §7.1, Г-9) — «9 активних профілів із завантаженими
 * сторінками — не більше 4 ГБ RAM». Раніше потребувало людини біля
 * Диспетчера задач; app.getAppMetrics() дає ту саму цифру програмно.
 *
 * Не перевіряє другу половину НФ-1.3 («окремий профіль у стані idle —
 * не більше 350 МБ»): getAppMetrics() повертає метрики ПО ПРОЦЕСУ ОС,
 * без зіставлення з profileId, а таке зіставлення зараз ніде не
 * експонується. Загальний бюджет — головна, найчастіше цитована цифра.
 */
function serveMulti(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><body>page ${req.url}</body></html>`);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

test('9 profiles with loaded pages stay within the 4 GB RAM budget (НФ-1.3)', async () => {
  test.setTimeout(90_000);
  const { app, window, userDataDir } = await launchApp();
  const { server, port } = await serveMulti();
  try {
    await window.getByRole('button', { name: '9', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    const addressInputs = window.getByPlaceholder('Address');
    await expect(addressInputs).toHaveCount(9);

    for (let i = 0; i < 9; i++) {
      const input = addressInputs.nth(i);
      await input.click();
      await input.fill(`http://127.0.0.1:${port}/profile-${i}`);
      await input.press('Enter');
    }
    await expect(window.getByText('Enter an address to start')).toHaveCount(0, { timeout: 30_000 });

    // Дати рендерерам осісти після завантаження (JS heap GC, layout) —
    // миттєвий знімок одразу після навігації завищив би цифру.
    await window.waitForTimeout(2_000);

    const metrics = await app.evaluate(({ app: electronApp }) => electronApp.getAppMetrics());
    const totalKb = metrics.reduce((sum, m) => sum + m.memory.workingSetSize, 0);
    const totalMb = totalKb / 1024;
    const byType = metrics.reduce<Record<string, number>>((acc, m) => {
      acc[m.type] = (acc[m.type] ?? 0) + m.memory.workingSetSize / 1024;
      return acc;
    }, {});
    console.log(`total RAM: ${totalMb.toFixed(0)} MB across ${metrics.length} processes`, byType);

    expect(totalMb).toBeLessThan(4096);
  } finally {
    server.close();
    await cleanup(app, userDataDir);
  }
});
