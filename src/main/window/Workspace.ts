import { shell, type BaseWindow, type WebContents, type WebContentsView } from 'electron';
import type { CellRect, FrameState, Identity, Profile } from '@shared/types';
import { log } from '../logging/logger';
import { saveLastSession, sessionFor, updateProfile } from '../profile/ProfileManager';
import { installDownloadHandler } from '../download/downloads';
import { applyProxy, isHealthy, releaseProxy } from '../proxy/ProxyManager';
import {
  ZoomViewportStrategy,
  computeScale,
  type ViewportStrategy,
  type ViewportTarget,
} from './viewport/ViewportStrategy';
import { computeCells } from './GridLayout';
import { Frame } from './Frame';
import { matchHotkey, type HotkeyInput } from './hotkeys';

/**
 * НФ-1.5 — скільки має минути з моменту втрати фокусу, перш ніж фрейм
 * присипляється. Перевизначається MF_SLEEP_AFTER_MS/MF_SLEEP_SWEEP_INTERVAL_MS
 * у наскрізних тестах (tests/e2e/sleep.spec.ts) — живим прогоном 10 хв не чекають.
 */
const SLEEP_AFTER_MS = Number(process.env.MF_SLEEP_AFTER_MS) || 10 * 60 * 1000;
/** Як часто перевіряти кандидатів на присипляння. */
const SLEEP_SWEEP_INTERVAL_MS = Number(process.env.MF_SLEEP_SWEEP_INTERVAL_MS) || 60 * 1000;

export class Workspace {
  private readonly frames = new Map<string, Frame>();
  private maximized: string | null = null;
  private focused: string | null = null;
  private strategy: ViewportStrategy = new ZoomViewportStrategy();
  /**
   * 2026-08-04 — раніше `setAllFramesVisible()` лише пробігала ПОТОЧНІ
   * `this.frames` і нічого не запам'ятовувала: фрейм, перестворений через
   * `recreateFrame()` (Ф-5.4, перемикання «Save session») ПОКИ Settings
   * ще відкриті, отримував новий `Frame` із дефолтним `visible = true` —
   * білий (ще не навігований) WebContentsView вилазив НАД модалкою Settings
   * (§5.9 — view завжди над DOM оболонки) і робив її недосяжною для кліків.
   * Стан тепер зберігається тут і застосовується до КОЖНОГО новоствореного
   * фрейму в `createFrame()`, не лише до вже наявних на момент виклику.
   */
  private framesVisible = true;

  constructor(
    private readonly window: BaseWindow,
    private readonly shellView: WebContentsView,
    private readonly emit: <T>(channel: string, data: T) => void,
  ) {
    // Workspace живе всю сесію застосунку (dispose()/launch() лише
    // спорожняють this.frames), тому таймер заводиться раз тут, а не
    // навколо launch()/dispose() — інакше relaunch у тому самому процесі
    // накопичував би паралельні інтервали.
    setInterval(() => this.sweepSleepCandidates(), SLEEP_SWEEP_INTERVAL_MS).unref();
  }

  /** НФ-1.5 / НФ-1.3 — фокусований і розгорнутий фрейми ніколи не присипляються. */
  private sweepSleepCandidates(): void {
    for (const [id, frame] of this.frames) {
      if (id === this.focused || id === this.maximized) continue;
      if (frame.idleMs < SLEEP_AFTER_MS) continue;
      frame.sleep();
    }
  }

  setStrategy(strategy: ViewportStrategy): void {
    this.strategy = strategy;
  }

  /**
   * 2026-08-04 — ProfileManagerPanel потребує це на МОМЕНТ монтування
   * (Settings могли відкрити вже ПІСЛЯ того, як вкладка з'явилась і жодних
   * подальших `frame:state` не буде) — підписка на самі події не покриває
   * цей випадок, тому окремий разовий запит поточного стану.
   */
  tabPresence(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const [id, frame] of this.frames) result[id] = frame.activeWebContents() !== null;
    return result;
  }

  profileOf(profileId: string): Profile | undefined {
    return this.frames.get(profileId)?.profile;
  }

  /** Розгорнутий фрейм лишається сам; поза розгортанням — усі, якщо оверлей не ховає їх. */
  private visibilityFor(profileId: string): boolean {
    return this.framesVisible && (this.maximized === null || this.maximized === profileId);
  }

  /**
   * Спільна для launch() і recreateFrame() (Ф-5.4): створює Frame,
   * прив'язує сесію/теку завантажень і застосовує проксі ДО першої
   * навігації, але НЕ додає до this.frames і НЕ відкриває вкладку —
   * це лишається на розсуд викликача.
   */
  private async createFrame(profile: Profile): Promise<Frame> {
    const frame = new Frame(
      profile,
      this.window,
      (state: FrameState) => {
        this.emit<FrameState>('frame:state', state);
      },
      () => void this.applyViewport(frame, frame.cellRect),
      (input) => this.handleHotkey(profile.id, input),
    );

    const session = sessionFor(profile);

    // Ф-2.6 — тека завантажень прив'язується до сесії профілю.
    installDownloadHandler(session, profile.id, () => frame.downloadDir());

    // Ф-3.1 / Ф-3.7 — проксі застосовується ДО першої навігації.
    // Правила не містять DIRECT, тому фрейм не може піти напряму,
    // навіть якщо проксі недоступний (kill-switch Ф-3.8).
    await applyProxy(profile, session);

    // До будь-якої вкладки (openTab() тут ще не викликано) — щоб перше ж
    // activate() всередині openTab() побачило правильний стан видимості,
    // а не дефолтний `true` з конструктора Frame.
    frame.setVisible(this.visibilityFor(profile.id));

    return frame;
  }

  /**
   * Ф-1.5 — `restoredUrls` заповнюється лише при увімкненому відновленні
   * (`lastSession.urls`, збережено востаннє через persistSession()) і лише
   * для профілів, у яких на момент збереження було увімкнено persistSession.
   */
  async launch(profiles: Profile[], restoredUrls: Record<string, string> = {}): Promise<void> {
    for (const profile of profiles) {
      if (this.frames.has(profile.id)) continue;

      const frame = await this.createFrame(profile);
      this.frames.set(profile.id, frame);

      // Ф-1.7 — WebContentsView створюється лише якщо є куди переходити:
      // відновлена адреса (Ф-1.5) або явний startUrl профілю. Порожній
      // профіль лишається без вкладки — FramePlaceholder уже вміє показати
      // порожній стан (workspace.emptyFrame), а Frame.navigate() сама
      // відкриє вкладку на першому введенні адреси (if (!wc) this.openTab(url)).
      // Не заводити тут зайвий Chromium-рендерер на кожен з 9 профілів —
      // це прямий внесок у НФ-1.1 (холодний старт ≤5с) і НФ-1.3 (RAM).
      const restoredUrl = restoredUrls[profile.id];
      const startUrl = restoredUrl && restoredUrl !== 'about:blank'
        ? restoredUrl
        : profile.startUrl !== 'about:blank' ? profile.startUrl : undefined;
      if (startUrl) frame.openTab(startUrl);
    }
    this.relayoutFallback(profiles.length);
    if (!this.focused) this.focus(profiles[0]?.id ?? null);
  }

  /**
   * Ф-5.4 — партиція (`persist:` vs у пам'яті) фіксується під час створення
   * WebContentsView і не може змінитися в рантаймі. Єдиний коректний спосіб —
   * перестворити фрейм: старий закривається (поточний стан губиться), новий
   * відкривається на тій самій позиції в сітці з новою партицією.
   *
   * Підтвердження — відповідальність виклику з renderer (Ф-5.4: «запит на
   * підтвердження з попередженням про перезавантаження і втрату стану»).
   * Якщо профіль зараз не відкритий у робочій області, перестворювати
   * нічого — звичайний patch конфігурації.
   */
  async recreateFrame(profileId: string, persistSession: boolean): Promise<Profile> {
    const old = this.frames.get(profileId);
    if (!old) return updateProfile(profileId, { persistSession });

    const cell = old.cellRect;
    const wasMaximized = this.maximized === profileId;
    const wasFocused = this.focused === profileId;

    void releaseProxy(profileId);
    old.dispose();
    this.frames.delete(profileId);

    const updated = updateProfile(profileId, { persistSession });
    const frame = await this.createFrame(updated);
    this.frames.set(profileId, frame);
    frame.setCell(cell);
    frame.openTab();

    if (wasMaximized) this.maximized = profileId;
    await this.applyViewport(frame, cell);
    if (wasFocused || wasMaximized) this.focus(profileId);

    log.info({ code: 'frame.recreated', profileId, persistSession });
    return updated;
  }

  /**
   * АРХ-7 — renderer надсилає геометрію плейсхолдерів, main позиціонує view.
   * Це єдине джерело координат у нормальному режимі.
   */
  async setCellRects(rects: Record<string, CellRect>): Promise<void> {
    for (const [profileId, cell] of Object.entries(rects)) {
      const frame = this.frames.get(profileId);
      if (!frame) continue;
      frame.setCell(cell);
      await this.applyViewport(frame, cell);
    }
  }

  private relayoutFallback(count: number): void {
    const { width, height } = this.window.getContentBounds();
    const cells = computeCells(count, width, height);
    let i = 0;
    for (const frame of this.frames.values()) {
      const cell = cells[i++];
      if (cell) frame.setCell(cell);
    }
  }

  private async applyViewport(frame: Frame, cell: CellRect): Promise<void> {
    const { identity, userZoom } = frame.profile;
    const target: ViewportTarget = {
      logicalWidth: identity.logicalWidth,
      dpr: identity.dpr,
      screenWidth: identity.screenWidth,
      screenHeight: identity.screenHeight,
      userZoom,
    };

    const result = computeScale(cell, target);
    if (result.clamped) {
      // Ф-4.5 — компонування непридатне для роботи, треба попередити користувача.
      log.warn({
        code: 'viewport.scale_clamped',
        profileId: frame.profile.id,
        cellWidth: cell.width,
        logicalWidth: result.logicalWidth,
      });
    }

    const wc = frame.activeWebContents();
    if (wc) await this.strategy.apply(wc, cell, target);
  }

  /** Ф-1.8 — розгортання фрейму. Змінює лише scale, не логічний viewport. */
  maximize(profileId: string | null): void {
    this.maximized = profileId;
    for (const [id, frame] of this.frames) frame.setVisible(this.visibilityFor(id));
    if (profileId) this.focus(profileId);
    this.emit('workspace:layoutInvalidated', { reason: 'maximize' });
  }

  /**
   * Оболонка додається до contentView першою, а фрейми — після неї,
   * тому вони перекривають її по z. Модальні вікна інтерфейсу
   * (налаштування, самоперевірка) без цього виклику були б невидимі.
   */
  setAllFramesVisible(visible: boolean): void {
    this.framesVisible = visible;
    for (const [id, frame] of this.frames) frame.setVisible(this.visibilityFor(id));
  }

  /** Ф-1.9 — модель фокусу: клавіатурне введення отримує один фрейм. */
  focus(profileId: string | null): void {
    this.focused = profileId;
    if (profileId) this.frames.get(profileId)?.focus();
  }

  get maximizedProfileId(): string | null {
    return this.maximized;
  }

  frame(profileId: string): Frame | undefined {
    return this.frames.get(profileId);
  }

  withFrame(profileId: string, fn: (frame: Frame) => void): void {
    const frame = this.frames.get(profileId);
    if (frame) fn(frame);
  }

  withActiveWebContents(profileId: string, fn: (wc: WebContents) => void): void {
    this.frames.get(profileId)?.withActive(fn);
  }

  goBack(profileId: string): void {
    this.withActiveWebContents(profileId, (wc) => {
      if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    });
  }

  goForward(profileId: string): void {
    this.withActiveWebContents(profileId, (wc) => {
      if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    });
  }

  reload(profileId: string): void {
    this.withActiveWebContents(profileId, (wc) => wc.reload());
  }

  /**
   * Ф-7.1 / Ф-8.17 — гарячі клавіші. Викликається і з `before-input-event`
   * кожного фрейму (sourceProfileId — свій), і з оболонки (sourceProfileId
   * null — тоді дія стосується фокусованого фрейму, як і клавіатурний ввід
   * узагалі, Ф-1.9). Повертає true, якщо клавішу оброблено — виклик має
   * зробити event.preventDefault(), щоб сторінка її не побачила.
   */
  handleHotkey(sourceProfileId: string | null, input: HotkeyInput): boolean {
    const action = matchHotkey(input);
    if (!action) return false;

    if (action.kind === 'openSettings') {
      this.emit<undefined>('hotkey:openSettings', undefined);
      return true;
    }

    if (action.kind === 'cycleFrame') {
      const ids = [...this.frames.keys()];
      if (ids.length < 2) return true;
      const current = this.focused ?? ids[0]!;
      const idx = ids.indexOf(current);
      const step = action.reverse ? ids.length - 1 : 1;
      const next = ids[(idx + step) % ids.length]!;
      this.focus(next);
      this.emit<{ profileId: string }>('workspace:focusChanged', { profileId: next });
      return true;
    }

    const profileId = sourceProfileId ?? this.focused;
    if (!profileId || !this.frames.has(profileId)) return false;

    switch (action.kind) {
      case 'toggleMaximize':
        this.maximize(this.maximized === profileId ? null : profileId);
        return true;
      case 'goBack':
        this.goBack(profileId);
        return true;
      case 'goForward':
        this.goForward(profileId);
        return true;
      case 'reload':
        this.reload(profileId);
        return true;
      case 'openFind':
        this.emit<{ profileId: string }>('hotkey:openFind', { profileId });
        return true;
      case 'zoom':
        this.emit<{ profileId: string; direction: -1 | 1 | 0 }>('hotkey:zoom', { profileId, direction: action.direction });
        return true;
    }
  }

  /**
   * Ф-2.7 — користувацький зум НЕ викликає setZoomFactor напряму.
   * Він змінює userZoom у формулі Ф-4.5, після чого геометрія
   * перераховується стратегією. Інакше зум і масштабування комірки
   * боролися б за один і той самий регулятор.
   */
  async setUserZoom(profileId: string, userZoom: number): Promise<void> {
    const frame = this.frames.get(profileId);
    if (!frame) return;
    frame.profile.userZoom = userZoom;
    this.emit('workspace:layoutInvalidated', { reason: 'resize' });
    frame.push();
  }

  /** 2026-08-05 — no-op, якщо профіль зараз не відкритий у робочій області (звичайний patch конфігурації, як і proxy:assign). */
  reapplyIdentity(profileId: string, identity: Identity): void {
    this.frames.get(profileId)?.reapplyIdentity(identity);
  }

  /** 2026-08-05 — швидкий редактор проксі біля адресного рядка (FramePlaceholder.tsx): per-frame, не workspace-wide. */
  setToolbarOverlayOpen(profileId: string, open: boolean): void {
    this.frames.get(profileId)?.setToolbarOverlayOpen(open);
  }

  /** Ф-11.6 / Ф-13.24 — зовнішні посилання лише в системному браузері. */
  static openExternal(url: string): void {
    if (!/^https:\/\//i.test(url)) {
      log.warn({ code: 'shell.external_blocked', url });
      return;
    }
    void shell.openExternal(url);
  }

  /** Ф-3.8 — стан kill-switch для індикації в інтерфейсі. */
  isProxyHealthy(profileId: string): boolean {
    return isHealthy(profileId);
  }

  /**
   * Ф-1.5 — знімок «кількість, розташування, відкриті адреси» перед
   * закриттям. `saveLastSession` сам відфільтрує адреси до профілів
   * із увімкненим persistSession — тут просто збираємо все, що відкрито.
   */
  private persistSession(): void {
    const order: string[] = [];
    const urls: Record<string, string> = {};
    for (const frame of this.frames.values()) {
      order.push(frame.profile.id);
      const url = frame.activeWebContents()?.getURL();
      if (url) urls[frame.profile.id] = url;
    }
    saveLastSession(order, urls);
  }

  dispose(): void {
    this.persistSession();
    for (const frame of this.frames.values()) {
      void releaseProxy(frame.profile.id);
      frame.dispose();
    }
    this.frames.clear();
    this.maximized = null;
    this.focused = null;
  }

  get shellWebContents(): WebContents {
    return this.shellView.webContents;
  }
}
