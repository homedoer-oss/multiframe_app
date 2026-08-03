import type { WebContents } from 'electron';
import { log } from '../logging/logger';

/**
 * Обгортка над webContents.debugger.
 *
 * ⚠️ КРИТИЧНО (RECOMMENDATIONS.md §2): домен `Runtime` вмикати НЕ МОЖНА.
 *    `Runtime.enable` змінює поведінку `console` і виявляється зі сторінки
 *    стандартними трюками — тобто маскування видало б само себе.
 *    Для виконання коду використовуйте webContents.executeJavaScript,
 *    який не проходить через CDP.
 *
 * Перелік нижче — свідомо мінімальний. Розширення потребує окремого
 * обґрунтування і регресійного тесту на виявлення.
 */
const ALLOWED_DOMAINS = ['Page', 'Emulation'] as const;
const FORBIDDEN_DOMAINS = ['Runtime', 'Console', 'Debugger', 'Profiler', 'HeapProfiler'] as const;

export class CdpDomainError extends Error {}

function domainOf(method: string): string {
  return method.split('.')[0] ?? '';
}

export class CdpSession {
  private attached = false;
  /**
   * ⚠️ CDP-команда до першої навігації підвішує рендерер безстроково,
   * без помилки й без відхилення проміса (spikes/viewport-scaling/README.md,
   * знайдено на спайку Ф-4.5, той самий патерн ламав Frame.ts.openTab).
   * send() кидає, а не логує, доки navigated не true — щоб регресія
   * ламала виклик одразу, а не висіла мовчки в проді.
   */
  private navigated = false;

  constructor(private readonly wc: WebContents) {
    const markNavigated = (): void => { this.navigated = true; };
    wc.once('did-finish-load', markNavigated);
    wc.once('did-fail-load', markNavigated);
  }

  attach(): void {
    if (this.attached || this.wc.isDestroyed()) return;
    try {
      this.wc.debugger.attach('1.3');
      this.attached = true;
    } catch (err) {
      log.error({ code: 'cdp.attach_failed', error: String(err) });
    }
  }

  detach(): void {
    if (!this.attached || this.wc.isDestroyed()) return;
    try {
      this.wc.debugger.detach();
    } catch {
      /* ignore */
    }
    this.attached = false;
  }

  get isAttached(): boolean {
    return this.attached;
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T | null> {
    const domain = domainOf(method);

    if ((FORBIDDEN_DOMAINS as readonly string[]).includes(domain)) {
      // Кидаємо, а не логуємо: така помилка має ламати збірку на тестах.
      throw new CdpDomainError(
        `Домен CDP "${domain}" заборонений: він виявляється зі сторінки. ` +
          'Див. RECOMMENDATIONS.md §2.',
      );
    }
    if (!(ALLOWED_DOMAINS as readonly string[]).includes(domain)) {
      throw new CdpDomainError(
        `Домен CDP "${domain}" не входить до дозволеного переліку [${ALLOWED_DOMAINS.join(', ')}]. ` +
          'Розширення переліку потребує обґрунтування і тесту на виявлення.',
      );
    }
    if (!this.attached) return null;
    if (!this.navigated) {
      throw new CdpDomainError(
        `CDP-команда "${method}" надіслана до першої навігації WebContentsView — ` +
          'це підвішує рендерер безстроково без помилки. Навігуйте (навіть на about:blank) ' +
          'і дочекайтесь завершення (did-finish-load), перш ніж слати першу CDP-команду. ' +
          'Див. spikes/viewport-scaling/README.md.',
      );
    }

    try {
      return (await this.wc.debugger.sendCommand(method, params)) as T;
    } catch (err) {
      log.warn({ code: 'cdp.command_failed', method, error: String(err) });
      return null;
    }
  }
}
