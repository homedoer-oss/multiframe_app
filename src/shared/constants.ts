/**
 * Константи, зашиті у код. Джерело істини — ТЗ.md.
 *
 * ⚠️ Криптоадреси НІКОЛИ не завантажуються з мережі (Ф-13.7).
 *    Будь-яка зміна проходить через git-історію і підписаний реліз.
 *    Контрольні суми перевіряються в CI: `npm run verify:addresses` (Ф-13.21).
 */

/** Офіційний сайт проєкту. Усі зовнішні посилання будуються від цієї константи (Ф-13.22). */
export const SITE_URL = 'https://multiframe.app';

/**
 * 2026-08-04 — раніше вказувала на неіснуючий репозиторій
 * (`multiframe-app/multiframe-browser`, ніколи не існував) і ніде не
 * використовувалась — мертва й до того ж хибна константа. Реальний
 * репозиторій — `electron-builder.yml` (`publish.owner`/`publish.repo`).
 */
export const REPO_URL = 'https://github.com/homedoer-oss/multiframe_app';
/** Ф-<нова> — перевірка нової версії (App.tsx, кнопка «Download» біля Settings). */
export const RELEASES_URL = `${REPO_URL}/releases/latest`;

/**
 * Запит користувача 2026-08-05 — ручний вибір User-Agent зі списку
 * популярних. Свідомо ЛИШЕ Chromium-сумісні браузери (рішення користувача):
 * рушій під капотом завжди справжній Chromium (Electron), тож Firefox/Safari
 * в UA був би миттєво виявним неспівпадінням з Client Hints і реальною
 * поведінкою рушія (той самий принцип, що й версія Chrome у `clientHints.ts`
 * — джерело істини для версії й тут, і там). Платформа — завжди Windows
 * (як і `devices.ts`, DEVICE_PROFILES): підміна macOS/Linux з Windows-машини
 * неможлива послідовно (шрифти, ANGLE/WebGL, аудіостек).
 *
 * `brand` — назва в Client Hints (Sec-CH-UA), має відповідати заявленому
 * браузеру. `uaSuffix` — токен, що додається в кінець UA-рядка; `{major}`
 * підставляється фактичною версією рушія (не довільним числом — та сама
 * причина, що й в основному UA).
 */
export interface UaPreset {
  readonly id: string;
  readonly label: string;
  readonly brand: string;
  readonly uaSuffix: string;
}

export const UA_PRESETS: readonly UaPreset[] = [
  { id: 'chrome', label: 'Google Chrome (Windows)', brand: 'Google Chrome', uaSuffix: '' },
  { id: 'edge', label: 'Microsoft Edge (Windows)', brand: 'Microsoft Edge', uaSuffix: ' Edg/{major}.0.0.0' },
  { id: 'opera', label: 'Opera (Windows)', brand: 'Opera', uaSuffix: ' OPR/{major}.0.0.0' },
];

export type DonationNetwork = 'BTC' | 'ERC-20' | 'TRC-20' | 'SOL';

export interface DonationAddress {
  readonly network: DonationNetwork;
  readonly address: string;
}

/** Ф-13.19 — розділ «Підтримати проєкт». */
export const PROJECT_WALLETS: readonly DonationAddress[] = [
  { network: 'BTC', address: 'bc1q6zwx4q9andwpe08rgdhgu8qj8angt5gf9gws74' },
  { network: 'ERC-20', address: '0x575e6B208aF1b4849Aa3797d29A732442435d669' },
  { network: 'TRC-20', address: 'TNCWPQut8f3r2fP56LSiJdBymEANS5TNDZ' },
  { network: 'SOL', address: 'HMuDVXQq9bhb27LrHUQEHXWLJthvse5UM3rCQBQ4KYNy' },
] as const;

export const MIN_PROFILES = 1;
export const MAX_PROFILES = 9;

/**
 * Ф-9.5 / Ф-6.1 — кольорові мітки профілів. Окрема палітра від кольорів
 * станів (помилка/попередження/успіх), розрізнювана при дейтеранопії.
 * Спільна для main (типовий колір нового профілю) і renderer (пікер).
 */
export const PROFILE_COLOR_PALETTE = [
  '#2D8CFF', '#FFB020', '#4CD07D', '#C77DFF', '#FF6B6B', '#39C0C8', '#F49AC2', '#9BB1FF', '#E8C547',
] as const;

/** Ф-4.5 — межі коефіцієнта масштабування; поза ними робота непридатна. */
export const SCALE_MIN = 0.4;
export const SCALE_MAX = 1.6;

/** Реалістичні логічні ширини viewport для профілю ідентичності (Ф-4.5). */
export const LOGICAL_WIDTHS = [1280, 1366, 1440, 1512, 1536] as const;

/** Правдоподібні значення devicePixelRatio. */
export const PLAUSIBLE_DPR = [1, 1.25, 1.5, 2] as const;

/**
 * Ф-4.7 — набір шрифтів, доступний для `document.fonts.check()`.
 *
 * Стандартні шрифти, що постачаються з Windows 10/11, без Office чи
 * дизайнерських додатків. Один список для всіх DEVICE_PROFILES навмисно:
 * на відміну від GPU чи екрана, базовий набір шрифтів практично не
 * розрізняється між реальними Windows-машинами, тож спільне значення само
 * по собі не є віссю кореляції — унікальний або надто скромний набір був би
 * підозрілішим за типовий.
 */
export const WINDOWS_FONT_ALLOWLIST = [
  'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Cambria Math', 'Candara',
  'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima',
  'Franklin Gothic Medium', 'Gabriola', 'Gadugi', 'Georgia', 'Impact', 'Ink Free',
  'Javanese Text', 'Leelawadee UI', 'Lucida Console', 'Lucida Sans Unicode', 'Malgun Gothic',
  'Marlett', 'Microsoft Himalaya', 'Microsoft JhengHei', 'Microsoft New Tai Lue',
  'Microsoft PhagsPa', 'Microsoft Sans Serif', 'Microsoft Tai Le', 'Microsoft YaHei',
  'Microsoft Yi Baiti', 'MingLiU-ExtB', 'Mongolian Baiti', 'MS Gothic', 'MV Boli',
  'Myanmar Text', 'Nirmala UI', 'Palatino Linotype', 'Segoe MDL2 Assets', 'Segoe Print',
  'Segoe Script', 'Segoe UI', 'Segoe UI Emoji', 'Segoe UI Historic', 'Segoe UI Symbol',
  'SimSun', 'Sitka', 'Sylfaen', 'Symbol', 'Tahoma', 'Times New Roman', 'Trebuchet MS',
  'Verdana', 'Webdings', 'Wingdings', 'Yu Gothic',
] as const;

export const SUPPORTED_LOCALES = ['en', 'uk', 'de', 'es', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const FALLBACK_LOCALE: Locale = 'en';

/**
 * Ф-11.1–11.8 — вкладка «Платні проксі».
 *
 * Ф-11.4 — порядок НЕ визначається розміром комісії. Список відсортовано
 *          за придатністю для anti-detect: наявність residential і mobile.
 * Ф-11.5 — переважно datacenter-провайдери позначаються попередженням,
 *          узгоджено з вагами движка оцінки (Ф-10.17).
 * Ф-11.8 — параметр атрибуції статичний і однаковий для всіх встановлень;
 *          ідентифікатор користувача чи машини використовувати заборонено.
 */
export interface ProxyProvider {
  readonly id: string;
  readonly name: string;
  readonly affiliateUrl: string;
  readonly types: readonly ('residential' | 'mobile' | 'isp' | 'datacenter')[];
  /** Ф-11.2 — модель тарифікації обов'язкова: економіка дев'яти профілів різна. */
  readonly billing: 'traffic' | 'ip' | 'port';
  /** Ф-11.5 — попередження про підвищену ймовірність блокувань. */
  readonly datacenterWarning: boolean;
}

export const PROXY_PROVIDERS: readonly ProxyProvider[] = [
  {
    id: 'iproyal',
    name: 'IPRoyal',
    affiliateUrl: 'https://iproyal.com/?r=mfbrowser',
    types: ['residential', 'mobile', 'datacenter'],
    billing: 'traffic',
    datacenterWarning: false,
  },
  {
    id: 'infatica',
    name: 'Infatica',
    affiliateUrl: 'https://dashboard.infatica.io/aff.php?aff=853',
    types: ['residential', 'mobile'],
    billing: 'traffic',
    datacenterWarning: false,
  },
  {
    id: 'webshare',
    name: 'Webshare',
    affiliateUrl: 'https://www.webshare.io/?referral_code=km2coitau7oj',
    types: ['datacenter', 'residential'],
    billing: 'ip',
    datacenterWarning: true,
  },
] as const;
