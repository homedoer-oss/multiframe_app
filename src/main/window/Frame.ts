import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { app, WebContentsView, type BaseWindow, type Input, type WebContents } from 'electron';
import type { CellRect, FrameErrorKind, FrameState, Profile, Tab } from '@shared/types';
import { log } from '../logging/logger';
import { partitionFor, sessionFor } from '../profile/ProfileManager';
import { CdpSession } from '../cdp/CdpSession';
import { applyIdentity } from '../identity/emulation';
import { classifyFailure } from './errors';

const HIDDEN: CellRect = { x: 0, y: 0, width: 0, height: 0 };

interface TabEntry {
  id: string;
  view: WebContentsView;
  cdp: CdpSession;
  title: string;
  loading: boolean;
}

/**
 * Фрейм = один профіль + набір вкладок (Ф-2.2).
 * Усі вкладки одного фрейму ділять одну сесію Chromium, тому cookies
 * і сховище спільні всередині профілю й ізольовані між профілями (АРХ-3).
 */
export class Frame {
  private readonly tabs = new Map<string, TabEntry>();
  private activeTabId: string | null = null;
  private cell: CellRect = { ...HIDDEN };
  private visible = true;
  private lastFocusedAt = Date.now();
  /** Ф-1.5/НФ-1.5/НФ-1.3 — не null, доки фрейм присипаний: URL для wake(). */
  private sleepMemory: { url: string; active: boolean }[] | null = null;

  constructor(
    readonly profile: Profile,
    private readonly window: BaseWindow,
    private readonly emit: (state: FrameState) => void,
    /**
     * Ф-2.7/Ф-4.5, гіпотеза Г-7 спайку: зум зберігається per-origin
     * у межах сесії, тож після навігації на новий origin його треба
     * перевстановити. Frame не знає про ViewportStrategy — це виклик
     * назад у Workspace, який знає і стратегію, і поточну комірку.
     */
    private readonly onTabReady?: () => void,
    /** Ф-7.1 / Ф-8.17 — гарячі клавіші; true = оброблено, сторінка не має бачити подію. */
    private readonly onHotkey?: (input: Input) => boolean,
  ) {}

  /** Ф-1.7 — вкладка створюється на вимогу, не наперед. */
  openTab(url?: string): string {
    const id = randomUUID();
    const view = new WebContentsView({
      webPreferences: {
        session: sessionFor(this.profile),
        contextIsolation: true, // НФ-2.1
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: true, // НФ-1.5
      },
    });

    const wc = view.webContents;
    registerFrameOwner(wc, this.profile.id);

    // Ф-3.9 — WebRTC не має обходити проксі й розкривати реальний IP.
    try {
      wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    } catch (err) {
      log.warn({ code: 'frame.webrtc_policy_failed', profileId: this.profile.id, error: String(err) });
    }

    // Ф-2.3 — window.open і target="_blank" відкриваються ВКЛАДКОЮ
    // того самого профілю. Перехід у сесію іншого профілю неможливий.
    wc.setWindowOpenHandler(({ url: target }) => {
      this.openTab(target);
      return { action: 'deny' };
    });

    // НФ-2.4 — дозволені лише http(s) і порожня сторінка.
    wc.on('will-navigate', (event, target) => {
      if (!/^https?:\/\//i.test(target) && target !== 'about:blank') {
        event.preventDefault();
        log.warn({ code: 'frame.navigation_blocked', profileId: this.profile.id, url: target });
        this.pushError('blocked', 'ERR_SCHEME_BLOCKED', target, target);
      }
    });

    // Профіль ідентичності застосовується ДО першої навігації:
    // скрипт, доданий після завантаження, не встигне пропатчити API
    // раніше за код сайту.
    const cdp = new CdpSession(wc);
    cdp.attach();

    const entry: TabEntry = { id, view, cdp, title: '', loading: false };
    this.bindEvents(entry);
    this.tabs.set(id, entry);
    this.window.contentView.addChildView(view);
    this.activate(id);

    void (async () => {
      // CDP-команда, надіслана до будь-якої навігації щойно створеного
      // WebContentsView, підвішує рендерер безстроково (спайк Ф-4.5,
      // spikes/viewport-scaling/README.md). Порожня навігація прогріває
      // сесію: сторінка about:blank не виконує стороннього JS, тож патч,
      // доданий одразу після, усе одно встигає до реальної навігації.
      await wc.loadURL('about:blank').catch(() => {});
      try {
        await applyIdentity(cdp, this.profile.identity);
      } catch (err) {
        log.error({ code: 'identity.apply_failed', profileId: this.profile.id, error: String(err) });
      }
      if (url) this.navigate(url);
    })();

    log.info({ code: 'tab.opened', profileId: this.profile.id, tabId: id, partition: partitionFor(this.profile) });
    return id;
  }

  private bindEvents(entry: TabEntry): void {
    const wc = entry.view.webContents;

    // Ф-7.1 — before-input-event перехоплює клавіші НЕЗАЛЕЖНО від того,
    // чи фокус усередині сторінки сайту, чи на елементах оболонки:
    // React-обробники renderer тут би не спрацювали взагалі.
    wc.on('before-input-event', (event, input) => {
      if (this.onHotkey?.(input)) event.preventDefault();
    });

    // Ф-2.4 — Chromium після did-fail-load одразу «фінішує» власним
    // порожнім документом на тому самому URL (підтверджено логами: різниця
    // ~25мс, той самий validatedURL) — без цього прапорця наступний
    // did-finish-load трактував би цей внутрішній коміт як успіх і стирав
    // би щойно показаний банер помилки. Скидається на початку КОЖНОЇ нової
    // спроби навігації (did-start-loading), тож повторний reload/перехід
    // за іншою адресою знову дає did-finish-load шанс на 'ready'.
    let failedThisLoad = false;

    wc.on('did-start-loading', () => { failedThisLoad = false; entry.loading = true; this.push({ kind: 'loading' }); });
    wc.on('did-stop-loading', () => { entry.loading = false; this.push(); });
    wc.on('page-title-updated', (_e, title) => { entry.title = title; this.push(); });

    wc.on('did-finish-load', () => {
      if (failedThisLoad) return;
      // Успішне завантаження знімає накладену помилку.
      this.setViewVisible(true);
      this.push({ kind: 'ready' });
      // Г-7 — зум per-origin, перевстановлюється на кожній навігації,
      // включно з початковою about:blank (нешкідливо, коштує один виклик).
      this.onTabReady?.();
    });

    // Ф-2.4 — помилка локалізується в оболонці й показується ТІЛЬКИ
    // у своєму фреймі, не впливаючи на інші.
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3 /* ERR_ABORTED */) return;
      failedThisLoad = true;
      const kind = classifyFailure(code);
      log.warn({ code: 'frame.load_failed', profileId: this.profile.id, errorCode: code, url, kind });
      this.pushError(kind, description || String(code), url, String(code));
    });

    wc.on('render-process-gone', (_e, details) => {
      log.error({ code: 'frame.renderer_gone', profileId: this.profile.id, reason: details.reason });
      this.pushError('network', 'ERR_RENDERER_CRASHED', wc.getURL(), details.reason);
    });
  }

  activate(tabId: string): void {
    if (!this.tabs.has(tabId)) return;
    this.activeTabId = tabId;
    for (const [id, entry] of this.tabs) {
      const isActive = id === tabId;
      entry.view.setVisible(isActive && this.visible);
      entry.view.setBounds(isActive ? this.cell : HIDDEN);
    }
    this.push();
  }

  closeTab(tabId: string): void {
    const entry = this.tabs.get(tabId);
    if (!entry) return;
    this.closeView(entry);
    this.tabs.delete(tabId);

    if (this.activeTabId === tabId) {
      const next = [...this.tabs.keys()][0] ?? null;
      this.activeTabId = next;
      if (next) this.activate(next);
      else this.push({ kind: 'idle' });
    } else {
      this.push();
    }
  }

  setCell(cell: CellRect): void {
    this.cell = cell;
    const active = this.activeEntry();
    if (active) active.view.setBounds(this.visible ? cell : HIDDEN);
  }

  get cellRect(): CellRect {
    return this.cell;
  }

  /**
   * Викликається з Workspace при показі/ховизі оверлея (Settings, Splash —
   * АРХ §5.9). Якщо активна вкладка зараз у стані помилки, view лишається
   * прихованим і після повернення оверлея: інакше він знову закрив би собою
   * FrameError оболонки, щойно оверлей закриється (view завжди рендериться
   * НАД DOM оболонки, z-index тут не діє).
   */
  setVisible(visible: boolean): void {
    this.visible = visible;
    const showActive = visible && this.lastStatus.kind !== 'error';
    for (const [id, entry] of this.tabs) entry.view.setVisible(showActive && id === this.activeTabId);
  }

  /** Ховає view, щоб крізь нього проступила локалізована помилка з оболонки. */
  private setViewVisible(visible: boolean): void {
    const active = this.activeEntry();
    if (active && this.visible) active.view.setVisible(visible);
  }

  navigate(url: string): void {
    const wc = this.activeWebContents();
    if (!wc) { this.openTab(url); return; }
    void wc.loadURL(url).catch((err: unknown) => {
      log.warn({ code: 'frame.navigate_failed', profileId: this.profile.id, url, error: String(err) });
    });
  }

  withActive(fn: (wc: WebContents) => void): void {
    const wc = this.activeWebContents();
    if (wc && !wc.isDestroyed()) fn(wc);
  }

  /** Ф-1.9 — клавіатурне введення отримує активний фрейм. Будить, якщо спав. */
  focus(): void {
    this.touch();
    if (this.isSleeping) this.wake();
    this.withActive((wc) => wc.focus());
  }

  activeWebContents(): WebContents | null {
    const entry = this.activeEntry();
    return entry && !entry.view.webContents.isDestroyed() ? entry.view.webContents : null;
  }

  private activeEntry(): TabEntry | undefined {
    return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
  }

  private snapshotTabs(): Tab[] {
    return [...this.tabs.values()].map((e) => ({
      id: e.id,
      title: e.title || e.view.webContents.getURL() || '',
      url: e.view.webContents.getURL(),
      loading: e.loading,
    }));
  }

  private pushError(error: FrameErrorKind, detail: string, url: string, code: string): void {
    this.setViewVisible(false);
    this.push({ kind: 'error', error, code, detail, url });
  }

  private lastStatus: FrameState['status'] = { kind: 'idle' };

  push(status?: FrameState['status']): void {
    if (status) this.lastStatus = status;
    const wc = this.activeWebContents();
    this.emit({
      profileId: this.profile.id,
      status: this.lastStatus,
      tabs: this.snapshotTabs(),
      activeTabId: this.activeTabId,
      canGoBack: wc?.navigationHistory.canGoBack() ?? false,
      canGoForward: wc?.navigationHistory.canGoForward() ?? false,
      currentUrl: wc?.getURL() ?? '',
      userZoom: this.profile.userZoom,
    });
  }

  /** Ф-2.6 — окрема тека завантажень на профіль. */
  downloadDir(): string {
    return join(app.getPath('downloads'), 'MultiFrame', this.profile.name);
  }

  touch(): void {
    this.lastFocusedAt = Date.now();
  }

  /** Мс від моменту, коли фрейм востаннє БУВ фокусованим (не «зараз фокусований»). */
  get idleMs(): number {
    return Date.now() - this.lastFocusedAt;
  }

  get isSleeping(): boolean {
    return this.sleepMemory !== null;
  }

  /**
   * НФ-1.5 / НФ-1.3 — «присипляння»: вивантажує WebContentsView неактивного
   * профілю (реальне звільнення пам'яті рендерера, а не лише
   * backgroundThrottling — той сам по собі не вкладається в бюджет
   * ≤350 МБ на idle-профіль, ANALYSIS.md §4.6), запам'ятовуючи адреси
   * для відновлення. Порожні/about:blank вкладки й так нічого не важать —
   * не варто присипляти профіль, у якого й спати нема чому.
   */
  sleep(): void {
    if (this.sleepMemory || this.tabs.size === 0) return;

    const memory = [...this.tabs.values()]
      .map((e) => ({ url: e.view.webContents.getURL(), active: e.id === this.activeTabId }))
      .filter((t) => t.url && t.url !== 'about:blank');
    if (memory.length === 0) return; // немає збереженого контенту — просто лишити як є

    for (const entry of this.tabs.values()) this.closeView(entry);
    this.tabs.clear();
    this.activeTabId = null;
    this.sleepMemory = memory;
    this.push({ kind: 'idle' });
    log.info({ code: 'frame.slept', profileId: this.profile.id, tabs: memory.length });
  }

  /** Відновлення після sleep() — ті самі openTab()/applyIdentity, що й при звичайному відкритті. */
  private wake(): void {
    if (!this.sleepMemory) return;
    const memory = this.sleepMemory;
    this.sleepMemory = null;
    for (const t of memory) {
      const id = this.openTab(t.url);
      if (t.active) this.activate(id);
    }
    log.info({ code: 'frame.woken', profileId: this.profile.id, tabs: memory.length });
  }

  dispose(): void {
    for (const entry of this.tabs.values()) this.closeView(entry);
    this.tabs.clear();
    this.activeTabId = null;
  }

  /**
   * Спільне закриття вкладки для closeTab()/sleep()/dispose().
   *
   * ⚠️ `window-all-closed` фіксує стан ПІСЛЯ того, як вікно вже почало
   * закриватися — на момент, коли dispose() тут викликається з цієї події,
   * this.window і/або entry.view.webContents можуть вже бути знищені самим
   * Electron. Без guard/try-catch removeChildView()/webContents.close()
   * кидають «Object has been destroyed» як необроблений виняток, що й
   * спостерігалось (STATE.md розділ 7.5). Мета тут — звільнити ресурси,
   * якщо вони ще живі; якщо їх уже звільнило само вікно, вважати це успіхом.
   */
  private closeView(entry: TabEntry): void {
    entry.cdp.detach();
    try {
      if (!this.window.isDestroyed() && !entry.view.webContents.isDestroyed()) {
        this.window.contentView.removeChildView(entry.view);
      }
      if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
    } catch (err) {
      log.warn({ code: 'frame.close_view_race', profileId: this.profile.id, error: String(err) });
    }
  }
}

/** Зіставлення webContents → профіль, потрібне глобальним обробникам Electron. */
const owners = new WeakMap<WebContents, string>();
export function registerFrameOwner(wc: WebContents, profileId: string): void {
  owners.set(wc, profileId);
}
export function ownerOf(wc: WebContents): string | undefined {
  return owners.get(wc);
}
