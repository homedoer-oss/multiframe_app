import { defineConfig } from '@playwright/test';

/**
 * Ф-7 (ANALYSIS.md §Етап 7) — автотести на матрицю приймання через
 * Playwright for Electron. Один застосунок = один процес: паралельні
 * прогони конфліктували б за той самий userData/порти локальних серверів.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
});
