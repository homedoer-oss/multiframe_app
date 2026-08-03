import { MAX_PROFILES, MIN_PROFILES } from '@shared/constants';
import type { CellRect } from '@shared/types';

export interface GridShape {
  cols: number;
  rows: number;
}

/** Ф-1.3 — автоматична сітка від 1×1 до 3×3. */
export function gridShape(count: number): GridShape {
  const n = Math.min(Math.max(count, MIN_PROFILES), MAX_PROFILES);
  if (n === 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

/**
 * Рівномірна сітка. Використовується лише як запасний варіант:
 * основне джерело координат — плейсхолдери в renderer (АРХ-7),
 * які надсилаються через `workspace:setCellRects`.
 */
export function computeCells(count: number, width: number, height: number): CellRect[] {
  const { cols, rows } = gridShape(count);
  const cw = Math.floor(width / cols);
  const ch = Math.floor(height / rows);
  return Array.from({ length: count }, (_, i) => ({
    x: (i % cols) * cw,
    y: Math.floor(i / cols) * ch,
    width: cw,
    height: ch,
  }));
}
