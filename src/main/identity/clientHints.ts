import { UA_PRESETS } from '@shared/constants';

/**
 * Ф-4.4 — User-Agent і Client Hints.
 *
 * webContents.setUserAgent змінює лише рядок UA. navigator.userAgentData
 * і заголовки Sec-CH-UA* залишаються від Electron за замовчуванням.
 * Розбіжність між UA-рядком і Client Hints — один із найдешевших
 * детекторів спуфінгу, тому вони мають задаватися разом.
 *
 * ⚠️ Джерело істини для версії — фактичний Chromium у складі збірки,
 *    а не довільне число. Якщо UA заявляє Chrome 141, а рушій 134,
 *    невідповідність видно за наявністю нових API.
 */
export interface UserAgentMetadata {
  brands: { brand: string; version: string }[];
  fullVersionList: { brand: string; version: string }[];
  fullVersion: string;
  platform: string;
  platformVersion: string;
  architecture: string;
  model: string;
  mobile: boolean;
  bitness: string;
  wow64: boolean;
}

export function chromiumVersion(): string {
  return process.versions.chrome ?? '0.0.0.0';
}

export function majorVersion(): string {
  return chromiumVersion().split('.')[0] ?? '0';
}

function presetFor(presetId: string): (typeof UA_PRESETS)[number] {
  return UA_PRESETS.find((p) => p.id === presetId) ?? (UA_PRESETS[0] as (typeof UA_PRESETS)[number]);
}

/** 2026-08-05 — presetId обирає бренд (Chrome/Edge/Opera); версія рушія завжди фактична, не з пресету. */
export function buildUserAgent(presetId: string = UA_PRESETS[0]!.id): string {
  const suffix = presetFor(presetId).uaSuffix.replace('{major}', majorVersion());
  return (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    `Chrome/${majorVersion()}.0.0.0 Safari/537.36${suffix}`
  );
}

/**
 * GREASE-бренд обов'язковий: реальний Chrome завжди додає випадковий
 * «сміттєвий» запис, і його відсутність сама по собі є сигналом.
 */
function greaseBrand(major: string): { brand: string; version: string } {
  const templates = ['Not/A)Brand', 'Not_A Brand', 'Not.A/Brand', 'Not;A=Brand'];
  const index = Number(major) % templates.length;
  return { brand: templates[index] as string, version: '99' };
}

export function buildMetadata(
  platformVersion: string,
  architecture: string,
  presetId: string = UA_PRESETS[0]!.id,
): UserAgentMetadata {
  const major = majorVersion();
  const full = chromiumVersion();
  const grease = greaseBrand(major);
  // Ф-4.4 — той самий бренд, що й у UA-рядку (buildUserAgent): Edge/Opera
  // з брендом "Google Chrome" у Client Hints — саме та розбіжність,
  // якої весь цей файл існує, щоб уникнути.
  const brand = presetFor(presetId).brand;

  return {
    brands: [grease, { brand: 'Chromium', version: major }, { brand, version: major }],
    fullVersionList: [
      { brand: grease.brand, version: '99.0.0.0' },
      { brand: 'Chromium', version: full },
      { brand, version: full },
    ],
    fullVersion: full,
    platform: 'Windows',
    platformVersion,
    architecture,
    model: '',
    mobile: false,
    bitness: '64',
    wow64: false,
  };
}
