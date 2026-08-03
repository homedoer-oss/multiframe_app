/**
 * Ф-4.3 — параметри мають бути ВЗАЄМНО УЗГОДЖЕНИМИ.
 * Ф-1.4 — мета: правдоподібний типовий пристрій, а не унікальний.
 *
 * Тому профілі задані цілісними наборами, а не набираються з незалежних
 * випадкових значень. Незалежний вибір GPU, екрана, кількості ядер і
 * пам'яті швидко породжує комбінації, яких не існує в природі
 * (наприклад, RTX 4090 із 4 ГБ пам'яті та екраном 1366×768) — і саме
 * така неможлива комбінація стає ідентифікатором.
 *
 * ⚠️ Усі профілі — Windows. Видавати себе за macOS із Windows-машини
 *    неможливо послідовно: набір шрифтів, поведінка WebGL через ANGLE
 *    і особливості аудіостека суперечили б заявленій платформі.
 */
export interface DeviceProfile {
  readonly id: string;
  readonly platformVersion: string;
  readonly architecture: string;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly dpr: number;
  readonly logicalWidth: number;
  readonly hardwareConcurrency: number;
  readonly deviceMemory: number;
  readonly gpuVendor: string;
  readonly gpuRenderer: string;
}

export const DEVICE_PROFILES: readonly DeviceProfile[] = [
  {
    id: 'office-1080p-intel',
    platformVersion: '10.0.0', architecture: 'x86',
    screenWidth: 1920, screenHeight: 1080, dpr: 1, logicalWidth: 1280,
    hardwareConcurrency: 8, deviceMemory: 8,
    gpuVendor: 'Google Inc. (Intel)',
    gpuRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  },
  {
    id: 'laptop-1080p-scaled',
    platformVersion: '15.0.0', architecture: 'x86',
    screenWidth: 1920, screenHeight: 1080, dpr: 1.25, logicalWidth: 1366,
    hardwareConcurrency: 8, deviceMemory: 16,
    gpuVendor: 'Google Inc. (Intel)',
    gpuRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  },
  {
    id: 'gaming-1440p-nvidia',
    platformVersion: '15.0.0', architecture: 'x86',
    screenWidth: 2560, screenHeight: 1440, dpr: 1, logicalWidth: 1536,
    hardwareConcurrency: 16, deviceMemory: 16,
    gpuVendor: 'Google Inc. (NVIDIA)',
    gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  },
  {
    id: 'laptop-fhd-amd',
    platformVersion: '15.0.0', architecture: 'x86',
    screenWidth: 1920, screenHeight: 1080, dpr: 1, logicalWidth: 1440,
    hardwareConcurrency: 12, deviceMemory: 16,
    gpuVendor: 'Google Inc. (AMD)',
    gpuRenderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  },
  {
    id: 'ultrabook-hidpi',
    platformVersion: '15.0.0', architecture: 'x86',
    screenWidth: 2880, screenHeight: 1800, dpr: 2, logicalWidth: 1440,
    hardwareConcurrency: 12, deviceMemory: 16,
    gpuVendor: 'Google Inc. (Intel)',
    gpuRenderer: 'ANGLE (Intel, Intel(R) Arc(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  },
  {
    id: 'budget-1366',
    platformVersion: '10.0.0', architecture: 'x86',
    screenWidth: 1366, screenHeight: 768, dpr: 1, logicalWidth: 1280,
    hardwareConcurrency: 4, deviceMemory: 8,
    gpuVendor: 'Google Inc. (Intel)',
    gpuRenderer: 'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  },
];

/** Часовий пояс і мова, узгоджені з країною exit-IP (Ф-4.6). */
export const COUNTRY_LOCALE: Record<string, { timezone: string; locale: string; languages: string }> = {
  UA: { timezone: 'Europe/Kyiv', locale: 'uk-UA', languages: 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7' },
  PL: { timezone: 'Europe/Warsaw', locale: 'pl-PL', languages: 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7' },
  DE: { timezone: 'Europe/Berlin', locale: 'de-DE', languages: 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7' },
  FR: { timezone: 'Europe/Paris', locale: 'fr-FR', languages: 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7' },
  ES: { timezone: 'Europe/Madrid', locale: 'es-ES', languages: 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7' },
  GB: { timezone: 'Europe/London', locale: 'en-GB', languages: 'en-GB,en;q=0.9' },
  US: { timezone: 'America/New_York', locale: 'en-US', languages: 'en-US,en;q=0.9' },
  NL: { timezone: 'Europe/Amsterdam', locale: 'nl-NL', languages: 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7' },
};

export const DEFAULT_COUNTRY = 'US';
