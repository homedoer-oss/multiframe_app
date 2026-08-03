import type { Identity } from '@shared/types';

/**
 * Ф-4.9 — сторінка самоперевірки.
 *
 * RECOMMENDATIONS §4 — інструмент шукає НЕВІДПОВІДНОСТІ між заявленим
 * і фактичним, а не «бал анонімності». Оптимізація під зелений бал
 * зовнішнього чекера — класичний закон Гудхарта: метрика перестає бути
 * метрикою, щойно стає ціллю.
 *
 * RECOMMENDATIONS §3 — звіт машинно-читаний, щоб CI перетворював його
 * на регресійні асерти після кожного оновлення Electron.
 *
 * ⚠️ Збір виконується через webContents.executeJavaScript, а НЕ через CDP:
 *    Runtime.enable виявляється зі сторінки і зіпсував би саме те,
 *    що ми перевіряємо.
 */
export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface CheckResult {
  /** Технічний ідентифікатор, не локалізується (як коди журналу, Ф-8.20). */
  id: string;
  status: CheckStatus;
  expected?: string;
  actual?: string;
  note?: string;
}

export interface SelfCheckReport {
  profileId: string;
  collectedAt: string;
  checks: CheckResult[];
  failed: number;
  warned: number;
}

/** Виконується в main world сторінки; повертає лише примітиви. */
export const COLLECT_SCRIPT = `(() => {
  const out = {};
  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

  out.userAgent = navigator.userAgent;
  out.uaDataPlatform = safe(() => navigator.userAgentData && navigator.userAgentData.platform, null);
  out.uaDataBrands = safe(() => navigator.userAgentData
    ? navigator.userAgentData.brands.map(b => b.brand + ':' + b.version).join(', ') : null, null);
  out.uaDataMobile = safe(() => navigator.userAgentData ? navigator.userAgentData.mobile : null, null);

  out.timezone = safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone, null);
  out.locale = safe(() => Intl.DateTimeFormat().resolvedOptions().locale, null);
  out.languages = safe(() => navigator.languages.join(','), null);

  out.hardwareConcurrency = navigator.hardwareConcurrency;
  out.deviceMemory = safe(() => navigator.deviceMemory, null);
  out.platform = navigator.platform;

  out.screenWidth = screen.width;
  out.screenHeight = screen.height;
  out.innerWidth = window.innerWidth;
  out.innerHeight = window.innerHeight;
  out.outerHeight = window.outerHeight;
  out.dpr = window.devicePixelRatio;

  out.webdriver = safe(() => navigator.webdriver, undefined);
  out.hasChrome = safe(() => typeof window.chrome === 'object' && window.chrome !== null, false);
  out.hasChromeRuntime = safe(() => typeof (window.chrome || {}).runtime === 'object', false);

  out.webglRenderer = safe(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  }, null);

  out.toStringMasked = safe(() =>
    Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency')
      .get.toString().includes('[native code]'), false);

  out.canvasHash = safe(() => {
    const c = document.createElement('canvas');
    c.width = 60; c.height = 20;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'top'; ctx.font = '14px Arial';
    ctx.fillText('mf-probe', 2, 2);
    const url = c.toDataURL();
    let h = 0;
    for (let i = 0; i < url.length; i++) { h = ((h << 5) - h + url.charCodeAt(i)) | 0; }
    return String(h >>> 0);
  }, null);

  out.permissionsConsistent = 'pending';
  return out;
})()`;

type Collected = Record<string, unknown>;

function check(id: string, expected: unknown, actual: unknown, onMismatch: CheckStatus = 'fail'): CheckResult {
  const e = expected === null || expected === undefined ? '' : String(expected);
  const a = actual === null || actual === undefined ? '' : String(actual);
  return e === a ? { id, status: 'ok', actual: a } : { id, status: onMismatch, expected: e, actual: a };
}

/**
 * Порівняння заявленого профілю з тим, що бачить сторінка.
 * `proxyCountry` — країна exit-IP; Ф-4.6 вимагає, щоб таймзона їй відповідала.
 */
export function analyse(
  profileId: string,
  identity: Identity,
  collected: Collected,
  expectedTimezoneForProxy: string | null,
): SelfCheckReport {
  const checks: CheckResult[] = [];

  // Ф-4.4 — UA і Client Hints мають бути узгоджені між собою.
  checks.push(check('userAgent', identity.userAgent, collected.userAgent));
  checks.push(check('uaData.platform', 'Windows', collected.uaDataPlatform));
  checks.push(check('uaData.mobile', 'false', collected.uaDataMobile));

  const uaMajor = identity.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? '';
  const brands = String(collected.uaDataBrands ?? '');
  checks.push({
    id: 'uaData.versionMatchesUA',
    status: uaMajor && brands.includes(`:${uaMajor}`) ? 'ok' : 'fail',
    expected: `brand version ${uaMajor}`,
    actual: brands,
    note: 'розбіжність UA-рядка і Client Hints — найдешевший детектор спуфінгу',
  });

  // Ф-4.8 — сліди середовища.
  checks.push({ id: 'navigator.webdriver', status: collected.webdriver === undefined ? 'ok' : 'fail', actual: String(collected.webdriver) });
  checks.push({ id: 'window.chrome', status: collected.hasChrome ? 'ok' : 'fail', actual: String(collected.hasChrome) });
  checks.push({ id: 'window.chrome.runtime', status: collected.hasChromeRuntime ? 'ok' : 'fail', actual: String(collected.hasChromeRuntime) });
  checks.push({
    id: 'electronInUserAgent',
    status: /Electron/i.test(String(collected.userAgent)) ? 'fail' : 'ok',
    actual: /Electron/i.test(String(collected.userAgent)) ? 'знайдено' : 'відсутнє',
  });
  checks.push({
    id: 'patches.toStringMasked',
    status: collected.toStringMasked ? 'ok' : 'fail',
    actual: String(collected.toStringMasked),
    note: 'без маскування перевірка в один рядок викриває весь шар',
  });

  // Ф-4.7 — апаратні параметри з профілю.
  checks.push(check('navigator.hardwareConcurrency', identity.hardwareConcurrency, collected.hardwareConcurrency));
  checks.push(check('navigator.deviceMemory', identity.deviceMemory, collected.deviceMemory));
  checks.push(check('webgl.unmaskedRenderer', identity.gpuRenderer, collected.webglRenderer));

  // Ф-4.6 — таймзона й локаль.
  checks.push(check('timezone', identity.timezone, collected.timezone));
  checks.push(check('locale', identity.locale, collected.locale, 'warn'));
  if (expectedTimezoneForProxy) {
    checks.push({
      id: 'timezoneMatchesProxyCountry',
      status: collected.timezone === expectedTimezoneForProxy ? 'ok' : 'fail',
      expected: expectedTimezoneForProxy,
      actual: String(collected.timezone),
      note: 'таймзона, що не відповідає країні exit-IP, — сильний сигнал',
    });
  }

  // Ф-4.5 — спайк закрито (варіант C+A, 2026-08-02), патч і ZoomViewportStrategy
  // застосовуються. Розбіжність тепер означає реальний збій маскування,
  // не відомий пробіл, тому статус за замовчуванням — 'fail'.
  checks.push(check('screen.width', identity.screenWidth, collected.screenWidth));
  checks.push(check('screen.height', identity.screenHeight, collected.screenHeight));
  checks.push(check('devicePixelRatio', identity.dpr, collected.dpr));

  const chromeHeight = Number(collected.outerHeight ?? 0) - Number(collected.innerHeight ?? 0);
  checks.push({
    id: 'browserChromeHeight',
    status: chromeHeight >= 60 ? 'ok' : 'fail',
    expected: '80–130 px',
    actual: `${chromeHeight} px`,
    note: 'нульова різниця outerHeight−innerHeight видає вбудований вебвміст',
  });

  const innerWidth = Number(collected.innerWidth ?? 0);
  checks.push({
    id: 'viewportWidth',
    status: innerWidth === identity.logicalWidth ? 'ok' : 'fail',
    expected: String(identity.logicalWidth),
    actual: String(innerWidth),
    note: 'розв’язка viewport від розміру комірки, Ф-4.5 — ZoomViewportStrategy тримає innerWidth сталим незалежно від комірки',
  });

  checks.push({ id: 'canvas.hash', status: 'ok', actual: String(collected.canvasHash ?? '') });

  return {
    profileId,
    collectedAt: new Date().toISOString(),
    checks,
    failed: checks.filter((c) => c.status === 'fail').length,
    warned: checks.filter((c) => c.status === 'warn').length,
  };
}
