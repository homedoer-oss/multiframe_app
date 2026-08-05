import { test, expect, type ElectronApplication } from '@playwright/test';
import { createServer, request as httpRequest } from 'node:http';
import { launchApp, cleanup, serveOnce } from './helpers';

function evalInTab<T>(app: ElectronApplication, url: string, script: string): Promise<T> {
  return app.evaluate(
    ({ webContents }, args) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL() === args.url);
      if (!wc) throw new Error(`no webContents with url ${args.url}`);
      return wc.executeJavaScript(args.script);
    },
    { url, script },
  );
}

/** Мінімальний HTTP-проксі, що вимагає Proxy-Authorization (407, як реальний платний проксі з логіном/паролем). */
function startAuthProxy(username: string, password: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const expected = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    const server = createServer((req, res) => {
      if (req.headers['proxy-authorization'] !== expected) {
        res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="test"' });
        res.end();
        return;
      }
      const url = new URL(req.url ?? '', 'http://placeholder');
      const upstream = httpRequest(
        { host: url.hostname, port: url.port || 80, path: url.pathname + url.search, method: req.method, headers: req.headers },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
          upstreamRes.pipe(res);
        },
      );
      req.pipe(upstream);
      upstream.on('error', () => res.destroy());
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ port: typeof addr === 'object' && addr ? addr.port : 0, close: () => server.close() });
    });
  });
}

/**
 * Знайдено користувачем 2026-08-05, після живого скріншота з реальним
 * платним HTTPS-проксі (логін+пароль): Test проходив («Score: 58»,
 * anonymous), але сама сторінка падала з `ERR_TUNNEL_CONNECTION_FAILED`
 * (-111), поки не перемкнеш чекбокс «Save session» у Settings.
 *
 * Причина — `installProxyAuthHandler()` (index.ts) на подію `login`
 * (проксі просить автентифікацію) читає `workspace.profileOf(profileId)`
 * → `frame.profile` — ЗАСТРЯГЛИЙ знімок з моменту СТВОРЕННЯ Frame, який
 * `proxy:assign` (на відміну від `session.setProxy()`, Ф-3.6) ніколи не
 * оновлював. Профіль стартує `direct` (без логіна) — тож застряглий
 * знімок мав `proxy.username === undefined`, обробник мовчки не давав
 * callback(), і CONNECT/проксі-автентифікація Chromium провалювалась.
 * `checker.ts` (кнопка Test) — окремий шлях, застряглого знімку не читає,
 * тому проходив завжди, незалежно від бага.
 */
test('assigning a password-protected proxy to an already-open frame actually authenticates', async () => {
  const { app, window, userDataDir } = await launchApp();
  const proxy = await startAuthProxy('kpnolizs', 's3cret');
  const { server: target, port: targetPort } = await serveOnce('auth proxy probe');
  try {
    await window.getByRole('button', { name: '1', exact: true }).click();
    await window.getByRole('button', { name: 'Open workspace' }).click();

    // Ф-3.6: фрейм уже створено на 'direct' ДО будь-якого призначення —
    // саме той стан, у якому `frame.profile` застрягав без логіна.
    const targetUrl = `http://127.0.0.1:${targetPort}/`;

    await window.getByRole('button', { name: 'Direct', exact: true }).click();
    await window.locator('select').first().selectOption('https');
    await window.getByPlaceholder('Host').fill('127.0.0.1');
    await window.getByPlaceholder('Port').fill(String(proxy.port));
    await window.getByPlaceholder('Username (optional)').fill('kpnolizs');
    await window.getByPlaceholder('Password (optional)').fill('s3cret');
    await window.getByRole('button', { name: 'Assign to this profile' }).click();
    await expect(window.getByText('Assigned.', { exact: false })).toBeVisible({ timeout: 15_000 });

    const addressInput = window.getByPlaceholder('Address');
    await addressInput.fill(targetUrl);
    await addressInput.press('Enter');
    await window.waitForTimeout(2000);

    // Провал (до фіксу) — FrameError «Proxy unavailable», не наш текст.
    const body = await evalInTab<string>(app, targetUrl, 'document.body.textContent');
    expect(body).toContain('auth proxy probe');
  } finally {
    proxy.close();
    target.close();
    await cleanup(app, userDataDir);
  }
});
