import { join } from 'node:path';
import { BaseWindow, WebContentsView, app, shell } from 'electron';
import { loadConfig } from './config/store';
import { log } from './logging/logger';
import { registerIpc } from './ipc/handlers';
import { Workspace } from './window/Workspace';
import { installCertificateHandler } from './security/certificates';
import { installProxyAuthHandler } from './proxy/ProxyManager';
import { createMaxMindProviderIfAvailable, setGeoAsnProvider } from './proxy/geoip';
import { detectRealIp } from './proxy/checker';
import { setRealIp } from './ipc/proxyHandlers';

let window: BaseWindow | null = null;
let workspace: Workspace | null = null;

/**
 * НФ-2.5 — обмеження кількості процесів рендерингу НЕ застосовується:
 * воно порушило б ізоляцію процесів між профілями.
 */

function createWindow(): void {
  loadConfig();

  window = new BaseWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 700,
    title: 'MultiFrame Browser',
    backgroundColor: '#081B33',
    show: false,
  });

  // Оболонка інтерфейсу: React рендерить плейсхолдери сітки (АРХ-7).
  const shellView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, // НФ-2.1
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.contentView.addChildView(shellView);

  const fit = (): void => {
    const { width, height } = window!.getContentBounds();
    shellView.setBounds({ x: 0, y: 0, width, height });
  };
  fit();
  window.on('resize', () => {
    fit();
    shellView.webContents.send('workspace:layoutInvalidated', { reason: 'resize' });
  });

  // НФ-2.2 — оболонка не може бути перенавантажена зовнішнім вмістом.
  shellView.webContents.on('will-navigate', (event, url) => {
    const dev = process.env.ELECTRON_RENDERER_URL;
    if (dev && url.startsWith(dev)) return;
    event.preventDefault();
    log.warn({ code: 'shell.navigation_blocked', url });
  });
  shellView.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  workspace = new Workspace(window, shellView, (channel, data) => {
    if (!shellView.webContents.isDestroyed()) shellView.webContents.send(channel, data);
  });

  // Ф-7.1 — гарячі клавіші, коли фокус на елементах оболонки (адресний
  // рядок тощо), а не всередині сторінки якогось фрейму (той випадок —
  // Frame.ts). sourceProfileId null: дія стосується фокусованого фрейму.
  shellView.webContents.on('before-input-event', (event, input) => {
    if (workspace?.handleHotkey(null, input)) event.preventDefault();
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void shellView.webContents.loadURL(devUrl);
  else void shellView.webContents.loadFile(join(__dirname, '../renderer/index.html'));

  // BaseWindow не має події ready-to-show (вона у BrowserWindow),
  // тому показуємо вікно за готовністю оболонки.
  //
  // Повторний fit() тут — не косметика. Перший виклик (рядок вище)
  // рахує getContentBounds() на ЩЕ НЕ показаному (`show:false`) вікні;
  // Chromium-компоузер WebContentsView на Windows не завжди коректно
  // застосовує ці межі, доки вікно фактично не відмальоване — частина
  // нижнього краю рендериться за видимою областю, аж доки не станеться
  // СПРАВЖНІЙ resize (який наново викликає fit() через обробник вище).
  // Користувач у такому стані бачив застосунок без нижньої смужки
  // (кнопка Settings) до ручного ресайзу вікна. Викликаючи fit() ще раз
  // одразу після show(), той самий перерахунок відбувається програмно.
  shellView.webContents.once('did-finish-load', () => {
    window?.show();
    fit();
  });
}

app.whenReady().then(() => {
  // Ф-2.5 — глобальний обробник помилок сертифікатів; політика береться з профілю.
  installCertificateHandler(
    (profileId) => workspace?.profileOf(profileId),
    (data) => workspace?.shellWebContents.send('frame:certificatePrompt', data),
  );
  // Ф-3.2 — автентифікація HTTP/HTTPS-проксі через подію login.
  installProxyAuthHandler((profileId) => workspace?.profileOf(profileId));
  // Ф-10.9 — реальна адреса потрібна для визначення прозорих проксі
  // (Ф-10.12). Раніше НІКОЛИ не встановлювалась — setRealIp() існував,
  // але ніхто його не викликав, тож пряме порівняння адрес у
  // detectAnonymity() було мертвим кодом від самого початку.
  void detectRealIp().then((ip) => {
    setRealIp(ip);
    if (!ip) log.warn({ code: 'proxy.real_ip_unknown' });
  });
  // Ф-4.6 — база вже завантажена раніше (geoip:downloadDatabases) з
  // попереднього запуску: активуємо без мережевого запиту при старті.
  const maxmind = createMaxMindProviderIfAvailable();
  if (maxmind) setGeoAsnProvider(maxmind);
  registerIpc(
    () => workspace,
    (channel, data) => {
      const wc = workspace?.shellWebContents;
      if (wc && !wc.isDestroyed()) wc.send(channel, data);
    },
  );
  createWindow();
  log.info({ code: 'app.started', chrome: process.versions.chrome, electron: process.versions.electron });
});

app.on('window-all-closed', () => {
  workspace?.dispose();
  app.quit();
});

process.on('uncaughtException', (err) => {
  log.error({ code: 'app.uncaught_exception', error: String(err), stack: err.stack });
});
