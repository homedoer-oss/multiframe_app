'use strict';
/**
 * Ф-4.5 spike — розв'язка логічного viewport від розміру комірки сітки.
 *
 * Створює сітку 3×3 з дев'яти WebContentsView, кожен із власною стратегією
 * масштабування, вимірює метрики, змінює розмір вікна, вимірює повторно
 * і друкує таблицю PASS/FAIL по гіпотезах Г-1…Г-7 з docs/F-4.5-viewport.md
 *
 * Запуск:  npm i && npm start
 */

const { app, BaseWindow, WebContentsView, session } = require('electron');
const path = require('path');
const fs = require('fs');

const COLS = 3;
const ROWS = 3;
const WIN_W = 1600;
const WIN_H = 1000;
const RESIZE_W = 1200;
const RESIZE_H = 760;
const OUT_DIR = path.join(__dirname, 'out');

const PLAUSIBLE_DPR = [1, 1.25, 1.5, 2, 3];
const CHROME_H = 88; // висота chrome реального Chrome (вкладки + адресний рядок)

/**
 * mode:
 *   none — контроль, нічого не застосовується
 *   zoom — webContents.setZoomFactor(scale)
 *   dm   — CDP Emulation.setDeviceMetricsOverride
 */
const CONFIGS = [
  { id: '1 baseline',         mode: 'none' },
  { id: '2 zoom',             mode: 'zoom', logicalW: 1280 },
  { id: '3 zoom+dsf',         mode: 'zoom', logicalW: 1280, dsf: 1 },
  { id: '4 zoom+dsf+patch',   mode: 'zoom', logicalW: 1366, dsf: 1, screen: [1920, 1080], patch: true },
  { id: '5 dm (no scale)',    mode: 'dm',   logicalW: 1280 },
  { id: '6 dm+scale',         mode: 'dm',   logicalW: 1280, useScale: true },
  { id: '7 dm+scale+dontset', mode: 'dm',   logicalW: 1280, useScale: true, dontSetVisibleSize: true },
  { id: '8 dm+scale+screen',  mode: 'dm',   logicalW: 1440, useScale: true, dsf: 1, screen: [1920, 1080] },
  { id: '9 dm+scale+patch',   mode: 'dm',   logicalW: 1512, useScale: true, dsf: 2, screen: [1920, 1080], patch: true },
];

const METRICS_JS = `({
  innerW: window.innerWidth,
  innerH: window.innerHeight,
  outerW: window.outerWidth,
  outerH: window.outerHeight,
  dpr: window.devicePixelRatio,
  screenW: screen.width,
  screenH: screen.height,
  availH: screen.availHeight,
  vvW: window.visualViewport ? Math.round(window.visualViewport.width) : -1,
  vvScale: window.visualViewport ? Math.round(window.visualViewport.scale * 1000) / 1000 : -1,
  docW: document.documentElement.clientWidth,
  scrollW: document.documentElement.scrollWidth,
  electronUA: /Electron/.test(navigator.userAgent)
})`;

function patchSource(screenW, screenH) {
  return `(() => {
  const def = (obj, key, getter) => {
    try { Object.defineProperty(obj, key, { get: getter, configurable: true }); } catch (e) {}
  };
  def(window, 'outerWidth',  () => window.innerWidth);
  def(window, 'outerHeight', () => window.innerHeight + ${CHROME_H});
  def(window, 'screenX', () => 0);
  def(window, 'screenY', () => 0);
  const S = window.Screen && window.Screen.prototype;
  if (S) {
    def(S, 'width',       () => ${screenW});
    def(S, 'height',      () => ${screenH});
    def(S, 'availWidth',  () => ${screenW});
    def(S, 'availHeight', () => ${screenH - 40});
    def(S, 'availLeft',   () => 0);
    def(S, 'availTop',    () => 0);
  }
})();`;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp(wc, method, params) {
  try {
    return await wc.debugger.sendCommand(method, params);
  } catch (e) {
    console.error(`  ! CDP ${method}: ${e.message}`);
    return null;
  }
}

function cellBounds(i, w, h) {
  const cw = Math.floor(w / COLS);
  const ch = Math.floor(h / ROWS);
  return {
    x: (i % COLS) * cw,
    y: Math.floor(i / COLS) * ch,
    width: cw - 3,
    height: ch - 3,
  };
}

async function applyStrategy(rec) {
  const { cfg, wc, bounds } = rec;
  if (cfg.mode === 'none') return;

  const scale = Number((bounds.width / cfg.logicalW).toFixed(4));
  rec.scale = scale;

  if (cfg.mode === 'zoom') {
    wc.setZoomFactor(scale);
    if (cfg.dsf || cfg.screen) {
      await cdp(wc, 'Emulation.setDeviceMetricsOverride', {
        width: 0,
        height: 0,
        deviceScaleFactor: cfg.dsf || 0,
        mobile: false,
        dontSetVisibleSize: true,
        ...(cfg.screen ? { screenWidth: cfg.screen[0], screenHeight: cfg.screen[1] } : {}),
      });
    }
    return;
  }

  if (cfg.mode === 'dm') {
    await cdp(wc, 'Emulation.setDeviceMetricsOverride', {
      width: cfg.logicalW,
      height: Math.round(bounds.height / scale),
      deviceScaleFactor: cfg.dsf || 0,
      mobile: false,
      ...(cfg.useScale ? { scale } : {}),
      ...(cfg.dontSetVisibleSize ? { dontSetVisibleSize: true } : {}),
      ...(cfg.screen
        ? { screenWidth: cfg.screen[0], screenHeight: cfg.screen[1], positionX: 0, positionY: 0 }
        : {}),
    });
  }
}

async function createView(win, cfg, index, bounds) {
  const ses = session.fromPartition(`spike-${index}`);
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.contentView.addChildView(view);
  view.setBounds(bounds);

  const wc = view.webContents;
  const rec = { cfg, index, view, wc, bounds, scale: 1 };

  try {
    wc.debugger.attach('1.3');
  } catch (e) {
    console.error(`  ! [${cfg.id}] debugger.attach: ${e.message}`);
  }

  // CDP-команди перед першою навігацією валять рендерер (crashpad "not connected").
  // Прогріваємо сесію порожньою навігацією, перш ніж чіпати Emulation/Page.
  await wc.loadURL('about:blank');

  if (cfg.patch) {
    await cdp(wc, 'Page.enable');
    await cdp(wc, 'Page.addScriptToEvaluateOnNewDocument', {
      source: patchSource(cfg.screen ? cfg.screen[0] : 1920, cfg.screen ? cfg.screen[1] : 1080),
    });
  }

  await applyStrategy(rec);

  // зум зберігається per-origin у межах сесії — перевіряємо Г-7, перевстановлюючи після завантаження
  wc.on('did-finish-load', () => {
    applyStrategy(rec).catch(() => {});
  });

  await wc.loadFile(path.join(__dirname, 'probe.html'), {
    query: { id: cfg.id, logicalW: String(cfg.logicalW || 0), mode: cfg.mode },
  });

  return rec;
}

async function measureAll(recs) {
  const out = [];
  for (const rec of recs) {
    try {
      out.push(await rec.wc.executeJavaScript(METRICS_JS, true));
    } catch (e) {
      out.push({ error: e.message });
    }
  }
  return out;
}

function reportMetrics(title, recs, ms) {
  console.log(`\n=== ${title} ===`);
  console.table(
    recs.map((rec, i) => {
      const m = ms[i] || {};
      return {
        config: rec.cfg.id,
        cell: `${rec.bounds.width}×${rec.bounds.height}`,
        scale: rec.scale,
        inner: `${m.innerW}×${m.innerH}`,
        outer: `${m.outerW}×${m.outerH}`,
        dpr: m.dpr,
        screen: `${m.screenW}×${m.screenH}`,
        vvScale: m.vvScale,
        scrollW: m.scrollW,
      };
    })
  );
}

function reportVerdict(recs, before, after) {
  console.log('\n=== ГІПОТЕЗИ (PASS/FAIL) ===');
  console.table(
    recs.map((rec, i) => {
      const b = before[i] || {};
      const a = after[i] || {};
      const cfg = rec.cfg;
      const wantW = cfg.logicalW;

      // Г-1/Г-3: логічна ширина відповідає заданій
      const viewport = wantW ? (Math.abs(b.innerW - wantW) <= 3 ? 'PASS' : `FAIL(${b.innerW})`) : '—';
      // Г-2: DPR перекрито значенням профілю, а не дорівнює scale
      const dpr = cfg.dsf
        ? (b.dpr === cfg.dsf ? 'PASS' : `FAIL(${b.dpr})`)
        : (PLAUSIBLE_DPR.includes(b.dpr) ? 'ok' : `нереаліст.(${b.dpr})`);
      // Г-3: контент не обрізаний — горизонтальний скрол не перевищує viewport
      const clipped = b.scrollW > b.innerW + 3 ? 'ОБРІЗАНО' : 'ok';
      // Г-4: screen.* з профілю
      const screen = cfg.screen
        ? (b.screenW === cfg.screen[0] ? 'PASS' : `FAIL(${b.screenW})`)
        : '—';
      // Г-5: chrome браузера присутній
      const chrome = b.outerH - b.innerH >= 60 ? 'PASS' : `FAIL(${b.outerH - b.innerH})`;
      // Г-6: viewport стабільний при ресайзі вікна
      const stable = b.innerW === a.innerW ? 'PASS' : `FAIL(${b.innerW}→${a.innerW})`;

      return { config: cfg.id, 'Г1/3 viewport': viewport, 'Г3 clip': clipped, 'Г2 dpr': dpr, 'Г4 screen': screen, 'Г5 chrome': chrome, 'Г6 stable': stable };
    })
  );

  console.log('\nГ-3 (візуальне масштабування) остаточно підтверджується оком і скріншотами у ./out —');
  console.log('вміст має бути ВПИСАНИЙ у комірку зменшеним, а не обрізаним по краю.');
  console.log('Г-8: спробуйте відкрити DevTools для будь-якого фрейму (View → Toggle DevTools) —');
  console.log('перевірка сумісності з постійно приєднаним debugger.');
}

async function screenshots(recs, tag) {
  for (const rec of recs) {
    try {
      const img = await rec.wc.capturePage();
      const name = `${tag}-${rec.cfg.id.replace(/[^a-z0-9]+/gi, '_')}.png`;
      fs.writeFileSync(path.join(OUT_DIR, name), img.toPNG());
    } catch (e) {
      console.error(`  ! capturePage [${rec.cfg.id}]: ${e.message}`);
    }
  }
}

function relayout(win, recs) {
  const cb = win.getContentBounds();
  recs.forEach((rec, i) => {
    rec.bounds = cellBounds(i, cb.width, cb.height);
    rec.view.setBounds(rec.bounds);
    applyStrategy(rec).catch(() => {});
  });
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const win = new BaseWindow({
    width: WIN_W,
    height: WIN_H,
    title: 'Ф-4.5 — viewport scaling spike',
    backgroundColor: '#111111',
  });

  const cb0 = win.getContentBounds();
  console.log(`content area: ${cb0.width}×${cb0.height}, cell: ${Math.floor(cb0.width / COLS)}×${Math.floor(cb0.height / ROWS)}`);

  const recs = [];
  for (let i = 0; i < CONFIGS.length; i++) {
    recs.push(await createView(win, CONFIGS[i], i, cellBounds(i, cb0.width, cb0.height)));
  }

  await wait(2500);
  const before = await measureAll(recs);
  reportMetrics(`СІТКА 3×3 @ ${cb0.width}×${cb0.height}`, recs, before);
  await screenshots(recs, 'grid');

  // ---- ресайз вікна: чи стабільний viewport (Г-6) ----
  win.setContentSize(RESIZE_W, RESIZE_H);
  await wait(400);
  relayout(win, recs);
  await wait(1500);

  const after = await measureAll(recs);
  const cb1 = win.getContentBounds();
  reportMetrics(`ПІСЛЯ РЕСАЙЗУ @ ${cb1.width}×${cb1.height}`, recs, after);
  await screenshots(recs, 'resized');

  reportVerdict(recs, before, after);

  // повертаємо вихідний розмір і залишаємо вікно для візуальної перевірки
  win.setContentSize(cb0.width, cb0.height);
  await wait(300);
  relayout(win, recs);

  win.on('resize', () => relayout(win, recs));

  console.log('\nСкріншоти: ' + OUT_DIR);
  console.log('Вікно залишено відкритим для візуальної перевірки. Ctrl+C для виходу.\n');
});

app.on('window-all-closed', () => app.quit());
