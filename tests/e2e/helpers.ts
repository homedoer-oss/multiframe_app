import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Кожен тест — свій ізольований --user-data-dir: інакше прогони писали б
 * у той самий конфіг, що й розробницький `npm run dev`, і заважали б один
 * одному між прогонами.
 */
export async function launchApp(
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; window: Page; userDataDir: string }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mf-e2e-'));
  // Без цього застосунок визначає мову з app.getSystemLocale() (Ф-8.2) —
  // на реальній машині розробника це може бути будь-яка з 5 підтримуваних,
  // а тексти в тестах нижче — англійські.
  writeFileSync(
    join(userDataDir, 'config.json'),
    JSON.stringify({ version: 1, settings: { locale: 'en' }, profiles: [], lastSession: null }),
    'utf8',
  );

  const env = { ...process.env, ...extraEnv };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: [join(__dirname, '..', '..', 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env,
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { app, window, userDataDir };
}

export async function cleanup(app: ElectronApplication, userDataDir: string): Promise<void> {
  await app.close();
  // Знайдено 2026-08-03 через реальний прогін CI (Windows-раннер), не
  // локально: `app.close()` повертається до того, як ОС фактично звільнила
  // всі файли дочірніх процесів (мережевий сервіс Electron тримає файл
  // у Network/ ще якийсь час) — негайний rmSync іноді ловить EBUSY.
  // maxRetries/retryDelay — вбудована в Node підтримка саме такої гонки
  // на Windows, а не довільний костиль.
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

export function serveOnce(text: string): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><body>${text}</body></html>`);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}
