/**
 * Ф-4.7 / Ф-4.8 — патчі fingerprint-API.
 *
 * АРХ-6 — інжектується в MAIN WORLD до виконання скриптів сторінки через
 * Page.addScriptToEvaluateOnNewDocument. Preload з contextIsolation тут
 * не підходить: він працює в isolated world і не бачить main world.
 *
 * Функція нижче серіалізується через toString(), тому вона НЕ МОЖЕ
 * посилатися на зовнішню область видимості — усе потрібне приходить
 * у config. Такий підхід дає перевірку компілятором і позбавляє
 * екранування, властивого шаблонним рядкам.
 */
/**
 * Поверхня браузерних глобалів, яких торкається патч.
 *
 * Файл лежить у main-процесі, але його ТІЛО виконується у сторінці.
 * Підключати DOM-бібліотеку до tsconfig main-процесу було б помилкою:
 * тоді решта main-коду отримала б document і window, яких там немає,
 * і справжні помилки перестали б виявлятися.
 *
 * Тому потрібні глобали оголошені явно. Це не обхід типізації, а опис
 * контракту: перелік нижче — вичерпний список того, що ми підміняємо.
 */
interface PatchTargets {
  window: Record<string, unknown>;
  Navigator: { prototype: object };
  Permissions?: { prototype: { query(desc: { name: string }): Promise<unknown> } };
  Notification?: { permission: string };
  CanvasRenderingContext2D?: {
    prototype: { getImageData(...args: unknown[]): { data: Uint8ClampedArray } };
  };
  HTMLCanvasElement?: {
    prototype: {
      toDataURL(...args: unknown[]): string;
      getContext(kind: string): unknown;
      width: number;
      height: number;
    };
  };
  AudioBuffer?: { prototype: { getChannelData(channel: number): Float32Array } };
  Element?: { prototype: { getBoundingClientRect(): RectLike } };
  DOMRect?: new (x: number, y: number, width: number, height: number) => RectLike;
  WebGLRenderingContext?: GlConstructor;
  WebGL2RenderingContext?: GlConstructor;
  Screen?: { prototype: Record<string, unknown> };
  FontFaceSet?: { prototype: { check(font: string, text?: string): boolean } };
}

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GlConstructor {
  prototype: Record<string, unknown>;
}

export interface PatchConfig {
  seed: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  gpuVendor: string;
  gpuRenderer: string;
  languages: string[];
  platform: string;
  /** RECOMMENDATIONS §5 — індивідуальний зсув годинника проти кореляції. */
  clockOffsetMs: number;
  chromeMajor: string;
  /**
   * Ф-4.5 — властивості профілю, НЕ похідні від поточної комірки сітки.
   * `outerWidth`/`outerHeight` тут не задаються: вони обчислюються нижче
   * динамічно від `innerWidth`/`innerHeight`, бо `ZoomViewportStrategy`
   * (variant C) змінює їх після навігації через setZoomFactor, а цей
   * скрипт виконується лише один раз, до першої навігації.
   */
  dpr: number;
  screenWidth: number;
  screenHeight: number;
  /**
   * Ф-4.7 — «Обмеження результатів вимірювання доступним у профілі набором».
   * Закриває лише `document.fonts.check()` — явну перевірку наявності
   * шрифту. Вимірювання ширини тексту через canvas/`getBoundingClientRect`
   * для довільного `font-family` цим НЕ закривається: без керування
   * реальним набором шрифтів рендерера коректно підмінити метрики
   * довільного шрифту неможливо, не зламавши layout сторінок, які
   * легітимно використовують шрифт із цього ж списку.
   */
  fonts: readonly string[];
}

function applyPatches(config: PatchConfig): void {
  const g = globalThis as unknown as PatchTargets;

  // --- детермінований генератор від seed профілю ---------------------------
  // Ф-4.7: шум має бути стабільним МІЖ ЗАПУСКАМИ, інакше fingerprint
  // профілю «плаває», і сайт бачить нового відвідувача щоразу — це
  // помітніше за стабільний, але підроблений відбиток.
  let h = 2166136261;
  for (let i = 0; i < config.seed.length; i++) {
    h ^= config.seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const baseSeed = h >>> 0;

  const rand = (salt: number): number => {
    let t = (baseSeed + Math.imul(salt, 2654435761)) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // --- маскування самих патчів --------------------------------------------
  // Без цього Function.prototype.toString() на пропатченому методі
  // повертає наш код — тобто маскування видає себе першим же рядком.
  const nativeToString = Function.prototype.toString;
  const nativeNames = new WeakMap<object, string>();

  // ⚠️ Оригінали ЗАВЖДИ зберігаються під іменем native*, відмінним від імені
  //    функції-замінника. Іменований функціональний вираз прив'язує власне
  //    ім'я у своїй області видимості й затінює зовнішню константу — патч
  //    почав би викликати сам себе замість оригіналу.
  const define = (target: object, key: string, value: unknown): void => {
    try {
      Object.defineProperty(target, key, { value, configurable: true, writable: true });
      if (typeof value === 'function') nativeNames.set(value as object, key);
    } catch { /* сторінка могла заморозити об'єкт */ }
  };

  const defineGetter = (target: object, key: string, getter: () => unknown): void => {
    try {
      Object.defineProperty(target, key, { get: getter, configurable: true });
      nativeNames.set(getter, `get ${key}`);
    } catch { /* ignore */ }
  };

  const patchedToString = new Proxy(nativeToString, {
    apply(target, thisArg, args: unknown[]): unknown {
      const name = typeof thisArg === 'function' ? nativeNames.get(thisArg as object) : undefined;
      if (name !== undefined) return 'function ' + name + '() { [native code] }';
      return Reflect.apply(target, thisArg, args as []);
    },
  });
  nativeNames.set(patchedToString, 'toString');
  define(Function.prototype, 'toString', patchedToString);

  // --- navigator ------------------------------------------------------------
  defineGetter(g.Navigator.prototype, 'hardwareConcurrency', () => config.hardwareConcurrency);
  defineGetter(g.Navigator.prototype, 'deviceMemory', () => config.deviceMemory);
  defineGetter(g.Navigator.prototype, 'languages', () => Object.freeze([...config.languages]));
  defineGetter(g.Navigator.prototype, 'platform', () => config.platform);

  // Ф-4.8 — ознака автоматизації має бути відсутня, а не false.
  try {
    delete (g.Navigator.prototype as unknown as Record<string, unknown>).webdriver;
  } catch { /* ignore */ }

  // --- Ф-4.5: розміри вікна й екрана ----------------------------------------
  // devicePixelRatio і screen.* — властивості профілю, статичні для його
  // життя. outerWidth/outerHeight НЕ статичні: їх треба читати з поточних
  // innerWidth/innerHeight, бо ZoomViewportStrategy змінює їх після того,
  // як цей скрипт уже виконався (він одноразовий, до першої навігації).
  // Стале зміщення «chrome» браузера — детерміноване від seed профілю,
  // не від Math.random, інакше воно «пливло» б між навігаціями.
  const chromeOffsetY = 80 + Math.floor(rand(90001) * 50); // 80..130 — Ф-4.5 §7
  const chromeOffsetX = Math.floor(rand(90002) * 17); // 0..16

  defineGetter(g.window, 'devicePixelRatio', () => config.dpr);
  defineGetter(g.window, 'outerWidth', () => (g.window.innerWidth as number) + chromeOffsetX);
  defineGetter(g.window, 'outerHeight', () => (g.window.innerHeight as number) + chromeOffsetY);
  defineGetter(g.window, 'screenX', () => 0);
  defineGetter(g.window, 'screenY', () => 0);

  try {
    if (!g.Screen) throw new Error('skip');
    const screenProto = g.Screen.prototype;
    defineGetter(screenProto, 'width', () => config.screenWidth);
    defineGetter(screenProto, 'height', () => config.screenHeight);
    defineGetter(screenProto, 'availWidth', () => config.screenWidth);
    defineGetter(screenProto, 'availHeight', () => config.screenHeight - 40);
    defineGetter(screenProto, 'availLeft', () => 0);
    defineGetter(screenProto, 'availTop', () => 0);
  } catch { /* ignore */ }

  // --- window.chrome --------------------------------------------------------
  // Ф-4.8: реальний Chrome завжди має цей об'єкт. Electron — ні.
  if (!g.window.chrome) {
    const started = Date.now();
    define(g.window, 'chrome', {
      runtime: {},
      loadTimes: function loadTimes() {
        return { requestTime: started / 1000, startLoadTime: started / 1000 };
      },
      csi: function csi() {
        return { startE: started, onloadT: started, pageT: Date.now() - started, tran: 15 };
      },
      app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' } },
    });
  }

  // --- узгодженість permissions --------------------------------------------
  // Класика виявлення: Notification.permission каже "denied",
  // а permissions.query повертає "prompt" — у справжньому браузері
  // такого розходження не буває.
  try {
    if (!g.Permissions || !g.Notification) throw new Error('skip');
    const permissions = g.Permissions;
    const notification = g.Notification;
    const nativeQuery = permissions.prototype.query;
    const patchedQuery = function query(this: unknown, desc: { name: string }): Promise<unknown> {
      if (desc && desc.name === 'notifications') {
        return Promise.resolve({
          state: notification.permission === 'default' ? 'prompt' : notification.permission,
          name: 'notifications', onchange: null,
        });
      }
      return Reflect.apply(nativeQuery, this, [desc]) as Promise<unknown>;
    };
    define(permissions.prototype, 'query', patchedQuery);
  } catch { /* ignore */ }

  // --- canvas ---------------------------------------------------------------
  const perturb = (data: Uint8ClampedArray): void => {
    // Достатньо змінити молодші біти небагатьох пікселів: хеш зміниться,
    // зображення візуально — ні.
    const step = Math.max(1, Math.floor(data.length / 4 / 64)) * 4;
    for (let i = 0, n = 0; i < data.length; i += step, n++) {
      const delta = Math.floor(rand(n) * 3) - 1;
      data[i] = Math.max(0, Math.min(255, (data[i] as number) + delta));
    }
  };

  try {
    if (!g.CanvasRenderingContext2D || !g.HTMLCanvasElement) throw new Error('skip');
    const canvas2d = g.CanvasRenderingContext2D;
    const canvasElement = g.HTMLCanvasElement;
    const nativeGetImageData = canvas2d.prototype.getImageData;
    define(canvas2d.prototype, 'getImageData', function getImageData(
      this: unknown, ...args: unknown[]
    ): { data: Uint8ClampedArray } {
      const result = Reflect.apply(nativeGetImageData, this, args) as { data: Uint8ClampedArray };
      perturb(result.data);
      return result;
    });

    const nativeToDataURL = canvasElement.prototype.toDataURL;
    define(canvasElement.prototype, 'toDataURL', function toDataURL(
      this: { getContext(k: string): unknown; width: number; height: number }, ...args: unknown[]
    ): string {
      try {
        const ctx = this.getContext('2d') as { putImageData(i: unknown, x: number, y: number): void } | null;
        if (ctx) {
          const image = Reflect.apply(nativeGetImageData, ctx, [0, 0, this.width || 1, this.height || 1]) as { data: Uint8ClampedArray };
          perturb(image.data);
          ctx.putImageData(image, 0, 0);
        }
      } catch { /* контекст міг бути webgl */ }
      return Reflect.apply(nativeToDataURL, this, args) as string;
    });
  } catch { /* ignore */ }

  // --- WebGL ----------------------------------------------------------------
  const patchGl = (proto: GlConstructor | undefined): void => {
    if (!proto) return;
    try {
      const nativeGetParameter = proto.prototype.getParameter as (p: number) => unknown;
      define(proto.prototype, 'getParameter', function getParameter(this: unknown, param: number): unknown {
        if (param === 0x9245) return config.gpuVendor;    // UNMASKED_VENDOR_WEBGL
        if (param === 0x9246) return config.gpuRenderer;  // UNMASKED_RENDERER_WEBGL
        if (param === 0x1f00) return 'Google Inc. (Google)'; // VENDOR
        if (param === 0x1f01) return 'ANGLE (Google, Vulkan)'; // RENDERER
        return Reflect.apply(nativeGetParameter, this, [param]);
      });
    } catch { /* ignore */ }
  };
  patchGl(g.WebGLRenderingContext);
  patchGl(g.WebGL2RenderingContext);

  // --- шрифти (Ф-4.7) --------------------------------------------------------
  // document.fonts.check() — явна перевірка наявності шрифту. Реальний
  // список у config.fonts, а не той, що фактично встановлений на машині,
  // де запущено рендерер.
  try {
    if (!g.FontFaceSet) throw new Error('skip');
    const proto = g.FontFaceSet.prototype;
    const nativeCheck = proto.check;
    const allow = new Set(config.fonts.map((f) => f.toLowerCase()));
    const generic = new Set([
      'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
      'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong',
    ]);
    define(proto, 'check', function check(this: unknown, font: string, text?: string): boolean {
      try {
        // Зрізаємо style/variant/weight/stretch/size(/line-height) — лишається
        // список сімейств. Розмір — обов'язковий токен у font-shorthand,
        // тому він завжди присутній і є надійною межею розрізу.
        const familyPart = font.replace(/^.*?[\d.]+(?:px|pt|em|rem|%)\s*(?:\/\s*[\d.]+\s*)?/, '');
        const families = familyPart
          .split(',')
          .map((f) => f.trim().replace(/^["']|["']$/g, '').toLowerCase())
          .filter(Boolean);
        if (families.length === 0) return Reflect.apply(nativeCheck, this, [font, text]) as boolean;
        return families.some((f) => generic.has(f) || allow.has(f));
      } catch {
        return Reflect.apply(nativeCheck, this, [font, text]) as boolean;
      }
    });
  } catch { /* ignore */ }

  // --- AudioContext ---------------------------------------------------------
  try {
    if (!g.AudioBuffer) throw new Error('skip');
    const audioBuffer = g.AudioBuffer;
    const nativeGetChannelData = audioBuffer.prototype.getChannelData;
    define(audioBuffer.prototype, 'getChannelData', function getChannelData(
      this: unknown, channel: number
    ): Float32Array {
      const data = Reflect.apply(nativeGetChannelData, this, [channel]) as Float32Array;
      const step = Math.max(1, Math.floor(data.length / 128));
      for (let i = 0, n = 0; i < data.length; i += step, n++) {
        data[i] = (data[i] as number) + (rand(n + 1024) - 0.5) * 1e-7;
      }
      return data;
    });
  } catch { /* ignore */ }

  // --- ClientRects ----------------------------------------------------------
  try {
    if (!g.Element || !g.DOMRect) throw new Error('skip');
    const element = g.Element;
    const Rect = g.DOMRect;
    const getRect = element.prototype.getBoundingClientRect;
    define(element.prototype, 'getBoundingClientRect', function getBoundingClientRect(
      this: unknown
    ): RectLike {
      const rect = Reflect.apply(getRect, this, []) as RectLike;
      const jitter = (rand(rect.width + rect.height) - 0.5) * 1e-3;
      return new Rect(rect.x + jitter, rect.y + jitter, rect.width + jitter, rect.height + jitter);
    });
  } catch { /* ignore */ }

  // --- зсув годинника -------------------------------------------------------
  // RECOMMENDATIONS §5: дев'ять профілів на одній машині мають однаковий
  // зсув системного часу відносно серверного. Це вісь кореляції, яку
  // не закриває жоден із патчів вище.
  if (config.clockOffsetMs !== 0) {
    try {
      const nativeNow = Date.now;
      define(Date, 'now', function now(): number {
        return nativeNow() + config.clockOffsetMs;
      });
    } catch { /* ignore */ }
  }
}

/**
 * Готовий до інжекції код: виклик серіалізованої функції з конфігурацією.
 *
 * ⚠️ applyPatches НЕ МОЖЕ посилатися на зовнішню область видимості —
 *    toString() серіалізує лише тіло функції, і будь-яка зовнішня константа
 *    перетворилася б на ReferenceError усередині сторінки. Помилка була б
 *    безшумною: патч не застосувався б, а профіль виглядав би незамаскованим.
 *    Перевірка нижче ловить це на етапі складання скрипта, а не на живому сайті.
 */
const BUNDLER_HELPER = /\b__(?:awaiter|generator|spread|assign|rest|decorate|toESM|commonJS)\w*/;

export function buildPatchScript(config: PatchConfig): string {
  const body = applyPatches.toString();

  if (BUNDLER_HELPER.test(body)) {
    throw new Error(
      'Серіалізований патч містить допоміжні функції бандлера. ' +
        'Вони не потраплять у сторінку — знизьте target або спростіть синтаксис.',
    );
  }
  if (!body.startsWith('function')) {
    throw new Error('Бандлер змінив форму applyPatches: очікувалося оголошення функції.');
  }

  return `(${body})(${JSON.stringify(config)});`;
}
