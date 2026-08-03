import { MAX_PROFILES, MIN_PROFILES } from '@shared/constants';

/** Дзеркало main/window/GridLayout.ts — Ф-1.3. */
export function gridShapeFor(count: number): { cols: number; rows: number } {
  const n = Math.min(Math.max(count, MIN_PROFILES), MAX_PROFILES);
  if (n === 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}
