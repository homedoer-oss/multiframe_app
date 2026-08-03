import type { Locale } from './constants';

export type ProxyMode = 'direct' | 'https' | 'socks5';

/** Клас проксі. `test` — з вкладки безкоштовних, з обмеженнями Ф-10.2. */
export type ProxyClass = 'manual' | 'imported' | 'test';

/** Ф-2.5 — політика для помилок сертифікатів. */
export type CertificatePolicy = 'block' | 'ask' | 'trust';

export interface ProxyConfig {
  mode: ProxyMode;
  host: string;
  port: number;
  username?: string;
  /** Пароль ніколи не потрапляє сюди — лише в safeStorage (Ф-5.5). */
  hasPassword: boolean;
  class: ProxyClass;
}

export type SubnetType = 'datacenter' | 'residential' | 'mobile' | 'unknown';
export type AnonymityLevel = 'transparent' | 'anonymous' | 'elite' | 'unknown';

/** Результат роботи движка оцінки якості (Ф-10.16). */
export interface ProxyQuality {
  exitIp: string;
  country: string | null;
  city: string | null;
  asn: string | null;
  operator: string | null;
  subnet: SubnetType;
  anonymity: AnonymityLevel;
  latencyMs: number | null;
  blacklists: string[];
  score: number;
  /** Ф-10.18 — показується завжди й помітно. */
  checkedAt: string;
}

/** Профіль ідентичності пристрою (Ф-4.1). */
export interface Identity {
  userAgent: string;
  platform: string;
  platformVersion: string;
  architecture: string;
  /** Ф-4.5 — властивість профілю, не наслідок компонування. */
  logicalWidth: number;
  dpr: number;
  screenWidth: number;
  screenHeight: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  gpuVendor: string;
  gpuRenderer: string;
  timezone: string;
  locale: string;
  acceptLanguages: string;
  /** Seed детермінованого шуму fingerprint-API (Ф-4.7). */
  noiseSeed: string;
  /** Індивідуальний зсув годинника, мс (RECOMMENDATIONS §5). */
  clockOffsetMs: number;
}

export interface Profile {
  id: string;
  name: string;
  color: string;
  startUrl: string;
  /** Ф-5.1 — визначає persist: чи in-memory партицію. */
  persistSession: boolean;
  proxy: ProxyConfig;
  identity: Identity;
  /** Ф-4.6 — країна exit-IP призначеного проксі; null, доки не визначено. */
  exitCountry: string | null;
  /** Ф-2.7 — користувацький зум, входить у формулу Ф-4.5. */
  userZoom: number;
  /** Ф-2.5 — за замовчуванням «блокувати». */
  certificatePolicy: CertificatePolicy;
  /** Відбитки, яким користувач явно довірив виняток. */
  trustedFingerprints: string[];
}

/**
 * Ф-2.4 / Ф-8.18 — помилка не показується вбудованою сторінкою Chromium
 * (її мова визначається локаллю Chromium, а не інтерфейсу). Замість цього
 * main ховає WebContentsView, а оболонка малює локалізовану помилку
 * поверх прямокутника комірки.
 */
export type FrameErrorKind =
  | 'network'
  | 'proxy'
  | 'certificate'
  | 'blocked';

export type FrameStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; error: FrameErrorKind; code: string; detail: string; url: string };

/** Ф-2.2 — вкладки всередині фрейму, обов'язкові для сценаріїв OAuth. */
export interface Tab {
  id: string;
  title: string;
  url: string;
  loading: boolean;
}

export interface FrameState {
  profileId: string;
  status: FrameStatus;
  tabs: Tab[];
  activeTabId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  currentUrl: string;
  /** Ф-2.7 — поточний користувацький зум; входить у формулу Ф-4.5. */
  userZoom: number;
}

export interface CellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppSettings {
  locale: Locale;
  theme: 'dark' | 'light';
  showFreeProxyTab: boolean;
  showPaidProxyTab: boolean;
  showSupportTab: boolean;
  /** Ф-11.9 — вимкнено за замовчуванням. */
  allowProviderListUpdate: boolean;
  /** Ф-10.13 — стеля одночасних з'єднань при перевірці проксі. */
  proxyCheckConcurrency: number;
  /** Ф-4.6 — дата останнього завантаження бази MaxMind GeoLite2, не секрет. */
  geoipLastUpdated: string | null;
}
