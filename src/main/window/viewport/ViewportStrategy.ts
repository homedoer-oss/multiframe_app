import type { WebContents } from 'electron';
import { SCALE_MAX, SCALE_MIN } from '@shared/constants';
import type { CellRect } from '@shared/types';

/**
 * Ф-4.5 — розв'язка логічного viewport від розміру комірки сітки.
 * Проєктне обґрунтування: docs/F-4.5-viewport.md
 *
 * ⚠️ Конкретна реалізація не обрана: вона залежить від результату спайку
 *    етапу 0 (spikes/viewport-scaling, гіпотези Г-1…Г-6).
 *    Доки спайк не закрито, активна NoopViewportStrategy.
 */
export interface ViewportTarget {
  /** З профілю ідентичності, НЕ з геометрії комірки. */
  logicalWidth: number;
  dpr: number;
  screenWidth: number;
  screenHeight: number;
  /** Ф-2.7 — входить у формулу як дільник логічної ширини. */
  userZoom: number;
}

export interface ScaleResult {
  scale: number;
  logicalWidth: number;
  logicalHeight: number;
  /** true, якщо scale довелося затиснути — компонування непридатне для роботи. */
  clamped: boolean;
}

/**
 * Формула з docs/F-4.5-viewport.md §4.
 *
 *   logicalW = profile.logicalWidth / userZoom
 *   scale    = cell.width / logicalW
 *   logicalH = cell.height / scale
 *
 * Логічна ширина стала, тому розгортання фрейму (Ф-1.8) не змінює
 * innerWidth і не породжує події resize по ширині.
 */
export function computeScale(cell: CellRect, target: ViewportTarget): ScaleResult {
  const logicalWidth = Math.round(target.logicalWidth / target.userZoom);
  const raw = cell.width / logicalWidth;
  const scale = Math.min(Math.max(raw, SCALE_MIN), SCALE_MAX);
  return {
    scale,
    logicalWidth,
    logicalHeight: Math.round(cell.height / scale),
    clamped: raw !== scale,
  };
}

export interface ViewportStrategy {
  readonly id: 'noop' | 'zoom' | 'cdp-scale' | 'osr';
  apply(wc: WebContents, cell: CellRect, target: ViewportTarget): Promise<void>;
  reset(wc: WebContents): Promise<void>;
}

/**
 * Етап 1: жодного втручання. Сторінка бачить фізичний розмір комірки.
 * Придатна лише для розробки — у релізі порушує Ф-4.5 і сигнали С-1…С-4.
 */
export class NoopViewportStrategy implements ViewportStrategy {
  readonly id = 'noop' as const;
  async apply(): Promise<void> {}
  async reset(): Promise<void> {}
}

/**
 * Варіант C + A, обраний за результатом спайку (docs/F-4.5-viewport.md §5,
 * spikes/viewport-scaling/README.md). CDP `Emulation.setDeviceMetricsOverride`
 * зі `scale` не масштабує вміст візуально в headful `WebContentsView` за
 * жодної комбінації параметрів — перевірено на всіх 9 конфігураціях спайку.
 * `setZoomFactor` — єдиний механізм, що дає видиме масштабування без обрізання.
 *
 * DPR, `outer*` і `screen.*` сюди НЕ входять: вони застосовуються один раз
 * до навігації через JS-патч (`identity/patchScript.ts`, частина A), бо CDP
 * `deviceScaleFactor` не перекриває DPR поверх активного зуму (Г-2 спайку).
 */
export class ZoomViewportStrategy implements ViewportStrategy {
  readonly id = 'zoom' as const;

  async apply(wc: WebContents, cell: CellRect, target: ViewportTarget): Promise<void> {
    if (wc.isDestroyed()) return;
    const { scale } = computeScale(cell, target);
    wc.setZoomFactor(scale);
  }

  async reset(wc: WebContents): Promise<void> {
    if (wc.isDestroyed()) return;
    wc.setZoomFactor(1);
  }
}
