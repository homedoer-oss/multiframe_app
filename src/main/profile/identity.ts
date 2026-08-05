import { randomUUID } from 'node:crypto';
import type { Identity } from '@shared/types';
import { UA_PRESETS } from '@shared/constants';
import { COUNTRY_LOCALE, DEFAULT_COUNTRY, DEVICE_PROFILES, type DeviceProfile } from '../identity/devices';
import { buildUserAgent, chromiumVersion } from '../identity/clientHints';

export { chromiumVersion as chromeVersion };

function pick<T>(list: readonly T[], rnd: () => number): T {
  return list[Math.floor(rnd() * list.length)] as T;
}

/**
 * Ф-4.2 — ідентичність або обирається з бібліотеки правдоподібних
 * конфігурацій, або генерується з валідних комбінацій.
 *
 * Ф-4.3 — беремо ЦІЛІСНИЙ профіль пристрою і не змішуємо його атрибути
 * з іншими. Незалежний вибір GPU, екрана й пам'яті створює комбінації,
 * яких не існує, і саме їх неможливість стає ідентифікатором.
 *
 * Ф-4.6 — таймзона, локаль і Accept-Language виводяться з країни exit-IP,
 * а не з мови інтерфейсу застосунку (Ф-8.6).
 */
export function createIdentity(country: string = DEFAULT_COUNTRY, rnd: () => number = Math.random): Identity {
  const device: DeviceProfile = pick(DEVICE_PROFILES, rnd);
  const region = COUNTRY_LOCALE[country] ?? COUNTRY_LOCALE[DEFAULT_COUNTRY];
  if (!region) throw new Error(`Невідома країна: ${country}`);
  // 2026-08-05 — «авто» для UA: той самий принцип, що й для решти профілю
  // пристрою (Ф-4.2) — випадковий, але завжди Chromium-сумісний пресет.
  const uaPreset = pick(UA_PRESETS, rnd);

  return {
    userAgent: buildUserAgent(uaPreset.id), // Ф-4.4 — версія з фактичного Chromium, зсув 0 (найбезпечніший — точний збіг)
    uaPresetId: uaPreset.id,
    uaVersionOffset: 0,
    platform: 'Windows',
    platformVersion: device.platformVersion,
    architecture: device.architecture,
    logicalWidth: device.logicalWidth,
    dpr: device.dpr,
    screenWidth: device.screenWidth,
    screenHeight: device.screenHeight,
    hardwareConcurrency: device.hardwareConcurrency,
    deviceMemory: device.deviceMemory,
    gpuVendor: device.gpuVendor,
    gpuRenderer: device.gpuRenderer,
    timezone: region.timezone,
    locale: region.locale,
    acceptLanguages: region.languages,
    noiseSeed: randomUUID(),
    // RECOMMENDATIONS §5 — індивідуальний зсув годинника: дев'ять профілів
    // на одній машині інакше мають однаковий зсув відносно серверного часу.
    clockOffsetMs: Math.round((rnd() - 0.5) * 8000),
  };
}

/** Ф-4.6 — перепризначення регіону після визначення країни exit-IP. */
export function retargetRegion(identity: Identity, country: string): Identity {
  const region = COUNTRY_LOCALE[country];
  if (!region) return identity;
  return { ...identity, timezone: region.timezone, locale: region.locale, acceptLanguages: region.languages };
}

/**
 * Запит користувача 2026-08-05 — ручний вибір User-Agent і (окремий запит
 * того самого дня) конкретної з 2-3 останніх версій пресету. Змінює ЛИШЕ
 * userAgent/uaPresetId/uaVersionOffset — решта ідентичності (пристрій,
 * GPU, екран, регіон) лишається незмінною: це вузьке налаштування одного
 * виміру, а не повний перегенерований профіль.
 */
export function withUaPreset(identity: Identity, presetId: string, versionOffset = 0): Identity {
  return {
    ...identity,
    userAgent: buildUserAgent(presetId, versionOffset),
    uaPresetId: presetId,
    uaVersionOffset: versionOffset,
  };
}

/**
 * «Авто» для UA — новий випадковий пресет, той самий принцип, що й у
 * createIdentity(). Зсув версії свідомо ЗАВЖДИ 0 (clientHints.ts) —
 * вибір старішої версії лишається винятково ручним рішенням користувача.
 */
export function withRandomUaPreset(identity: Identity, rnd: () => number = Math.random): Identity {
  return withUaPreset(identity, pick(UA_PRESETS, rnd).id, 0);
}
