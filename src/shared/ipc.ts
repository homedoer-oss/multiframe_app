/**
 * Типізований контракт IPC. Єдине джерело істини для main, preload і renderer.
 * Додавання каналу без опису тут — помилка компіляції в усіх трьох шарах.
 */
import type { AppSettings, CellRect, FrameState, Profile, ProxyConfig, ProxyQuality, UpdateStatus } from './types';
import type { DonationAddress, ProxyProvider } from './constants';

export interface DiscoveryProgress {
  total: number;
  done: number;
  accepted: number;
  rejectedTransparent: number;
}

export interface DiscoveryResult {
  host: string;
  port: number;
  mode: 'https' | 'socks5';
  quality: ProxyQuality | null;
  rejected: 'unreachable' | 'transparent' | null;
}

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface CheckResult {
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

export type AssignResult =
  | { ok: true }
  | { ok: false; reason: 'session_persisted' | 'storage_not_empty' | 'credentials_unavailable' };

export interface LaunchOptions {
  profileCount: number;
  restorePrevious: boolean;
}

/** renderer → main, з відповіддю. */
export interface IpcInvokeMap {
  'app:getSettings': { req: void; res: AppSettings };
  'app:setSettings': { req: Partial<AppSettings>; res: AppSettings };
  'app:hasPreviousSession': { req: void; res: boolean };

  'workspace:launch': { req: LaunchOptions; res: Profile[] };
  'workspace:close': { req: void; res: void };

  /**
   * АРХ-7: renderer повідомляє геометрію комірок, main позиціонує
   * WebContentsView відповідно. Плейсхолдери в DOM — єдине джерело координат.
   */
  'workspace:setCellRects': { req: Record<string, CellRect>; res: void };
  'workspace:maximizeFrame': { req: { profileId: string | null }; res: void };
  /**
   * WebContentsView лежать НАД оболонкою в порядку z, тому будь-яке
   * модальне вікно оболонки без цього виклику опинилося б під ними.
   */
  'workspace:setFramesVisible': { req: { visible: boolean }; res: void };

  'frame:navigate': { req: { profileId: string; url: string }; res: void };
  'frame:goBack': { req: { profileId: string }; res: void };
  'frame:goForward': { req: { profileId: string }; res: void };
  'frame:reload': { req: { profileId: string }; res: void };
  'frame:stop': { req: { profileId: string }; res: void };
  'frame:setZoom': { req: { profileId: string; userZoom: number }; res: void };
  /**
   * Ф-5.4 — партиція (persist: vs in-memory) фіксується під час створення
   * WebContentsView. Перемикання в рантаймі перестворює фрейм: якщо профіль
   * зараз не відкритий у робочій області, це звичайний patch без перестворення.
   */
  'frame:setPersistSession': { req: { profileId: string; persistSession: boolean }; res: Profile };

  'frame:newTab': { req: { profileId: string; url?: string }; res: string };
  'frame:closeTab': { req: { profileId: string; tabId: string }; res: void };
  'frame:activateTab': { req: { profileId: string; tabId: string }; res: void };
  'frame:openDevTools': { req: { profileId: string }; res: void };
  'frame:findInPage': { req: { profileId: string; text: string; forward: boolean }; res: void };
  'frame:stopFind': { req: { profileId: string }; res: void };
  /** Ф-1.9 — який фрейм отримує клавіатурне введення. */
  'frame:focus': { req: { profileId: string }; res: void };

  'profile:list': { req: void; res: Profile[] };
  'profile:update': { req: { id: string; patch: Partial<Profile> }; res: Profile };
  'profile:resetData': { req: { id: string }; res: void };

  /** Ф-10.15 — движок оцінки спільний для будь-яких проксі. */
  'proxy:evaluate': { req: { config: ProxyConfig }; res: ProxyQuality | null };
  /** Ф-10.2 — призначення перевіряється запобіжником для класу `test`. */
  'proxy:assign': { req: { profileId: string; config: ProxyConfig; password?: string }; res: AssignResult };
  'proxy:importList': { req: { text: string; mode: 'https' | 'socks5' }; res: number };
  'proxy:discoverStart': { req: { text?: string; mode: 'https' | 'socks5' }; res: number };
  'proxy:discoverStop': { req: void; res: void };
  /** Ф-11.1 — перелік провайдерів для вкладки платних проксі. */
  'proxy:providers': { req: void; res: readonly ProxyProvider[] };

  /**
   * Ф-4.6 / Ф-10.21 — локальна база MaxMind GeoLite2. Ключ і файли бази
   * ніколи не потрапляють у renderer — лише статус.
   */
  'geoip:getStatus': { req: void; res: { hasLicenseKey: boolean; hasDatabases: boolean; lastUpdated: string | null } };
  'geoip:setLicenseKey': { req: { licenseKey: string }; res: { ok: boolean } };
  'geoip:downloadDatabases': { req: void; res: { ok: boolean; error?: string } };

  /** НФ-3.2 — автооновлення через GitHub Releases; працює лише в упакованому застосунку. */
  'update:getStatus': { req: void; res: UpdateStatus };
  'update:check': { req: void; res: void };
  'update:install': { req: void; res: void };

  /** Ф-4.9 — самоперевірка профілю: невідповідності, а не «бал». */
  'identity:selfCheck': { req: { profileId: string }; res: SelfCheckReport };

  /** RECOMMENDATIONS §6 — бекап профілю разом зі сховищем. */
  'profile:backup': { req: { profileId: string; password: string; includeProxyPassword: boolean }; res: string };
  /** Файл читається в renderer через FileReader і йде тут base64 — sandbox-рендерер не бачить шляхів на диску. */
  'profile:restoreBackup': { req: { fileBase64: string; password: string }; res: Profile };
  'profile:diskUsage': { req: { profileId: string }; res: number };
  'profile:clearCache': { req: { profileId: string }; res: void };
  'profile:duplicate': { req: { id: string }; res: Profile };
  'profile:delete': { req: { id: string }; res: void };

  /** Ф-13.19 / Ф-13.22 — адреси й офіційний сайт беруться з коду, ніколи з мережі. */
  'support:wallets': { req: void; res: { project: readonly DonationAddress[]; siteUrl: string } };

  'shell:openExternal': { req: { url: string }; res: void };
}

/** main → renderer, без відповіді. */
export interface IpcEventMap {
  'frame:state': FrameState;
  /** Ф-2.5 — запит підтвердження при політиці «питати». */
  'frame:certificatePrompt': { profileId: string; url: string; fingerprint: string; issuer: string };
  'workspace:layoutInvalidated': { reason: 'resize' | 'maximize' | 'profileCount' };
  'app:settingsChanged': AppSettings;
  'proxy:discoveryProgress': DiscoveryProgress;
  'proxy:discoveryResult': DiscoveryResult;

  /** Ф-7.1 / Ф-1.9 — гаряча клавіша перемкнула фокус; renderer підсвічує рамку. */
  'workspace:focusChanged': { profileId: string };
  /** Ф-2.9 — Ctrl+F спрацював, доки фокус міг бути всередині сторінки фрейму. */
  'hotkey:openFind': { profileId: string };
  /** Ф-2.7 — Ctrl +/−/0; крокування зуму лишається логікою renderer. */
  'hotkey:zoom': { profileId: string; direction: -1 | 1 | 0 };
  /** Ф-7.1 — «відкриття налаштувань профілю» через Ctrl+,. */
  'hotkey:openSettings': void;
  /** НФ-3.2 — стан автооновлення, для індикатора в оболонці. */
  'update:status': UpdateStatus;
}

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcEventChannel = keyof IpcEventMap;

export const IPC_INVOKE_CHANNELS = [
  'app:getSettings', 'app:setSettings', 'app:hasPreviousSession',
  'workspace:launch', 'workspace:close', 'workspace:setCellRects', 'workspace:maximizeFrame',
  'workspace:setFramesVisible',
  'frame:navigate', 'frame:goBack', 'frame:goForward', 'frame:reload', 'frame:stop', 'frame:setZoom',
  'frame:setPersistSession',
  'frame:newTab', 'frame:closeTab', 'frame:activateTab', 'frame:openDevTools',
  'frame:findInPage', 'frame:stopFind', 'frame:focus',
  'profile:list', 'profile:update', 'profile:resetData',
  'identity:selfCheck',
  'profile:backup', 'profile:restoreBackup', 'profile:diskUsage', 'profile:clearCache', 'profile:duplicate', 'profile:delete',
  'proxy:evaluate', 'proxy:assign', 'proxy:importList',
  'proxy:discoverStart', 'proxy:discoverStop', 'proxy:providers',
  'geoip:getStatus', 'geoip:setLicenseKey', 'geoip:downloadDatabases',
  'update:getStatus', 'update:check', 'update:install',
  'support:wallets',
  'shell:openExternal',
] as const satisfies readonly IpcInvokeChannel[];

export const IPC_EVENT_CHANNELS = [
  'frame:state', 'frame:certificatePrompt', 'workspace:layoutInvalidated', 'app:settingsChanged',
  'proxy:discoveryProgress', 'proxy:discoveryResult',
  'workspace:focusChanged', 'hotkey:openFind', 'hotkey:zoom', 'hotkey:openSettings',
  'update:status',
] as const satisfies readonly IpcEventChannel[];

/** Форма, яку preload виставляє в renderer через contextBridge. */
export interface MultiFrameApi {
  invoke<C extends IpcInvokeChannel>(
    channel: C,
    payload: IpcInvokeMap[C]['req'],
  ): Promise<IpcInvokeMap[C]['res']>;
  on<C extends IpcEventChannel>(channel: C, listener: (data: IpcEventMap[C]) => void): () => void;
}
