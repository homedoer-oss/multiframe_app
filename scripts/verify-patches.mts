#!/usr/bin/env node --experimental-transform-types
/**
 * Регресійний тест шару маскування (Ф-4.7, Ф-4.8).
 *
 * RECOMMENDATIONS §3 — anti-detect є рухомою ціллю: оновлення Electron
 * може безшумно зламати патч. Цей набір має падати в CI, а не з'ясовуватись
 * на реальних акаунтах.
 *
 * Окремо стереже клас помилок, знайдений під час розробки: іменований
 * функціональний вираз затінює зовнішню константу з тим самим іменем,
 * і патч починає викликати сам себе замість оригіналу.
 */
import { buildPatchScript, type PatchConfig } from '../src/main/identity/patchScript.ts';
import vm from 'node:vm';

const cfg = (seed: string, offset = 4000): PatchConfig => ({
  seed, hardwareConcurrency: 12, deviceMemory: 16,
  gpuVendor: 'Google Inc. (NVIDIA)', gpuRenderer: 'ANGLE (NVIDIA, RTX 3060, D3D11)',
  languages: ['uk-UA', 'uk', 'en-US'], platform: 'Win32',
  clockOffsetMs: offset, chromeMajor: '141',
  dpr: 1.5, screenWidth: 1920, screenHeight: 1080,
  fonts: ['Arial', 'Comic Sans MS', 'Segoe UI'],
});

/** Мінімальний DOM, достатній для патчів. */
function makeSandbox() {
  class Navigator { }
  Object.defineProperties(Navigator.prototype, {
    hardwareConcurrency: { get: () => 4, configurable: true },
    deviceMemory: { get: () => 4, configurable: true },
    languages: { get: () => ['en'], configurable: true },
    platform: { get: () => 'Linux', configurable: true },
    webdriver: { get: () => true, configurable: true },
  });
  class Permissions { query(_d: any) { return Promise.resolve({ state: 'prompt' }); } }
  class CanvasRenderingContext2D {
    getImageData(_x: number, _y: number, w: number, h: number) {
      return { data: new Uint8ClampedArray(w * h * 4).fill(128), width: w, height: h };
    }
    putImageData(_i: any, _x: number, _y: number) {}
  }
  class HTMLCanvasElement {
    width = 16; height = 16;
    getContext(_k: string) { return new CanvasRenderingContext2D(); }
    toDataURL() { return 'data:image/png;base64,ORIGINAL'; }
  }
  class AudioBuffer { getChannelData(_c: number) { return new Float32Array(512).fill(0.25); } }
  class DOMRect { constructor(public x:number, public y:number, public width:number, public height:number){} }
  class Element { getBoundingClientRect() { return new DOMRect(10, 20, 100, 50); } }
  class WebGLRenderingContext { getParameter(_p: number) { return 'ORIGINAL'; } }
  class FontFaceSet {
    // «Нативна» поведінка: як у машині, де насправді нічого зі списку не встановлено.
    check(_font: string, _text?: string) { return false; }
  }
  class Screen {}
  Object.defineProperties(Screen.prototype, {
    width: { get: () => 1536, configurable: true },
    height: { get: () => 864, configurable: true },
    availWidth: { get: () => 1536, configurable: true },
    availHeight: { get: () => 824, configurable: true },
  });

  const win: any = { innerWidth: 1280, innerHeight: 650 };
  const ctx: any = {
    window: win, Navigator, Permissions, CanvasRenderingContext2D, HTMLCanvasElement,
    AudioBuffer, DOMRect, Element, WebGLRenderingContext, WebGL2RenderingContext: undefined,
    Screen, FontFaceSet,
    Notification: { permission: 'denied' },
    Math, Object, Reflect, Proxy, WeakMap, Promise, Date, JSON, Uint8ClampedArray, Float32Array,
    console,
  };
  win.chrome = undefined; win.WebGLRenderingContext = WebGLRenderingContext; win.screen = new Screen();
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}

const t = (n: string, ok: boolean, extra = '') => { console.log(`  ${ok?'✓':'✗'} ${n}${extra?'  ('+extra+')':''}`); return ok?0:1; };
let bad = 0;

// --- прогін 1 ---
const s1 = makeSandbox();
const realNow = Date.now();
vm.runInContext(buildPatchScript(cfg('profile-alpha')), s1);
const nav1 = new s1.Navigator();

console.log('\nnavigator:');
bad += t('hardwareConcurrency підмінено', nav1.hardwareConcurrency === 12);
bad += t('deviceMemory підмінено', nav1.deviceMemory === 16);
bad += t('languages підмінено', nav1.languages.join(',') === 'uk-UA,uk,en-US');
bad += t('webdriver ВИДАЛЕНО, а не false', nav1.webdriver === undefined, String(nav1.webdriver));

console.log('\nФ-4.8 — сліди середовища:');
bad += t('window.chrome присутній', typeof s1.window.chrome === 'object' && s1.window.chrome !== null);
bad += t('chrome.runtime присутній', typeof s1.window.chrome.runtime === 'object');
const perm = await new s1.Permissions().query({ name: 'notifications' });
bad += t('permissions узгоджено з Notification.permission', perm.state === 'denied', perm.state);

console.log('\nФ-4.5 — розміри вікна й екрана:');
bad += t('devicePixelRatio підмінено', s1.window.devicePixelRatio === 1.5, String(s1.window.devicePixelRatio));
bad += t('screen.width підмінено', s1.window.screen.width === 1920, String(s1.window.screen.width));
bad += t('screen.height підмінено', s1.window.screen.height === 1080, String(s1.window.screen.height));
bad += t('screen.availHeight = height - 40', s1.window.screen.availHeight === 1040, String(s1.window.screen.availHeight));
bad += t('screenX/screenY нульові', s1.window.screenX === 0 && s1.window.screenY === 0);

const outerWBefore = s1.window.outerWidth;
const outerHBefore = s1.window.outerHeight;
bad += t('outerWidth ≈ innerWidth (chrome 0..16px)', outerWBefore >= 1280 && outerWBefore <= 1296, String(outerWBefore));
bad += t('outerHeight − innerHeight у 80..130px', outerHBefore - 650 >= 80 && outerHBefore - 650 <= 130, String(outerHBefore - 650));

// Г-7 спайку: ZoomViewportStrategy змінює innerWidth/innerHeight ПІСЛЯ того,
// як цей скрипт уже виконався — outerWidth/outerHeight мають стежити за цим
// динамічно, а не лишатися замороженими на значеннях під час ін'єкції патчу.
s1.window.innerWidth = 900; s1.window.innerHeight = 500;
bad += t('outerWidth стежить за innerWidth динамічно', s1.window.outerWidth === outerWBefore - 380, String(s1.window.outerWidth));
bad += t('outerHeight стежить за innerHeight динамічно', s1.window.outerHeight === outerHBefore - 150, String(s1.window.outerHeight));

console.log('\nФ-4.7 — document.fonts.check():');
const fonts = new s1.FontFaceSet();
bad += t('шрифт зі списку профілю → true', fonts.check('16px Arial') === true);
bad += t('регістр не має значення', fonts.check('16px ARIAL') === true);
bad += t('generic family → true', fonts.check('16px sans-serif') === true);
bad += t('складний shorthand, лапки, фолбек → true',
  fonts.check('italic bold 14px/1.4 "Comic Sans MS", sans-serif') === true);
bad += t('шрифт поза списком профілю → false', fonts.check('16px "Not Installed Font"') === false);
bad += t('порожній рядок падає на нативну поведінку', fonts.check('') === false);

console.log('\nМаскування самих патчів:');
const src = s1.Navigator.prototype.constructor.toString();
const gp = Object.getOwnPropertyDescriptor(s1.Navigator.prototype, 'hardwareConcurrency')!.get!;
bad += t('патчений геттер виглядає як [native code]', gp.toString().includes('[native code]'), gp.toString());
bad += t('toString сам себе не видає', String(vm.runInContext('Function.prototype.toString.toString()', s1)).includes('[native code]'));

console.log('\nWebGL:');
const gl = new s1.WebGLRenderingContext();
bad += t('UNMASKED_RENDERER підмінено', gl.getParameter(0x9246) === 'ANGLE (NVIDIA, RTX 3060, D3D11)');
bad += t('інші параметри проходять наскрізь', gl.getParameter(0x1234) === 'ORIGINAL');

console.log('\nRECOMMENDATIONS §5 — зсув годинника:');
const shifted = s1.Date.now() - realNow;
bad += t('Date.now зсунуто на ~4000 мс', shifted >= 3900 && shifted <= 4200, `${shifted} мс`);

console.log('\nФ-4.7 — детермінованість шуму:');
const canvasOf = (seed: string) => {
  const s = makeSandbox();
  vm.runInContext(buildPatchScript(cfg(seed)), s);
  const c = new s.CanvasRenderingContext2D();
  return Array.from(c.getImageData(0,0,8,8).data).join(',');
};
const a1 = canvasOf('profile-alpha'), a2 = canvasOf('profile-alpha'), b1 = canvasOf('profile-beta');
bad += t('той самий seed → той самий шум (стабільність між запусками)', a1 === a2);
bad += t('різні seed → різний шум (профілі не корелюють)', a1 !== b1);

// --- серіалізація: патч має бути самодостатнім --------------------------
console.log('\nСеріалізація патча:');
const script = buildPatchScript(cfg('serialization-probe'));
bad += t('форма — виклик функції', /^\(function/.test(script));
bad += t('без допоміжних функцій бандлера', !/\b__(?:awaiter|generator|spread|assign|toESM|commonJS)\w*/.test(script));
bad += t('синтаксично валідний', (() => { try { new Function(script); return true; } catch { return false; } })());
bad += t('конфігурація вбудована як літерал', script.includes('"seed":"serialization-probe"'));

console.log(`\nПроблем: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
