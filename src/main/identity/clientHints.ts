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

export function buildUserAgent(): string {
  return (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    `Chrome/${majorVersion()}.0.0.0 Safari/537.36`
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

export function buildMetadata(platformVersion: string, architecture: string): UserAgentMetadata {
  const major = majorVersion();
  const full = chromiumVersion();
  const grease = greaseBrand(major);

  return {
    brands: [grease, { brand: 'Chromium', version: major }, { brand: 'Google Chrome', version: major }],
    fullVersionList: [
      { brand: grease.brand, version: '99.0.0.0' },
      { brand: 'Chromium', version: full },
      { brand: 'Google Chrome', version: full },
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
