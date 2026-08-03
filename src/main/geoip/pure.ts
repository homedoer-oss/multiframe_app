/**
 * Чиста частина завантажувача MaxMind — без залежності від Electron
 * (`app.getPath`) чи `tar`, щоб `scripts/verify-geoip.mts` міг перевірити
 * побудову URL напряму, без мережі й без стабів.
 */
export const GEOIP_EDITIONS = ['GeoLite2-ASN', 'GeoLite2-City'] as const;
export type GeoipEdition = (typeof GEOIP_EDITIONS)[number];

/**
 * Офіційний ендпоінт GeoLite2 приймає лише `license_key` як query-параметр
 * (без ідентифікатора акаунта) — той самий формат, що й у `geoipupdate`,
 * офіційному інструменті MaxMind.
 */
export function buildDownloadUrl(edition: GeoipEdition, licenseKey: string): string {
  const params = new URLSearchParams({ edition_id: edition, license_key: licenseKey, suffix: 'tar.gz' });
  return `https://download.maxmind.com/app/geoip_download?${params.toString()}`;
}
