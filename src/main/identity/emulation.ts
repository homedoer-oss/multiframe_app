import type { Identity } from '@shared/types';
import { WINDOWS_FONT_ALLOWLIST } from '@shared/constants';
import type { CdpSession } from '../cdp/CdpSession';
import { log } from '../logging/logger';
import { buildMetadata } from './clientHints';
import { buildPatchScript } from './patchScript';

/**
 * Застосування профілю ідентичності через CDP.
 *
 * ⚠️ Використовуються ЛИШЕ домени Page і Emulation.
 *    Runtime.enable вмикати не можна: він змінює поведінку console
 *    і виявляється зі сторінки (RECOMMENDATIONS §2). CdpSession
 *    кидає виняток при спробі — це навмисно, щоб помилка ламала тести,
 *    а не тихо погіршувала маскування.
 *
 * ⚠️ Порядок має значення: усе нижче застосовується ДО першої навігації.
 *    Скрипт, доданий після завантаження сторінки, не встигне пропатчити
 *    API до того, як їх прочитає код сайту.
 */
export async function applyIdentity(cdp: CdpSession, identity: Identity): Promise<void> {
  if (!cdp.isAttached) return;

  // Ф-4.7 / Ф-4.8 — інжекція патчів у main world до скриптів сторінки.
  await cdp.send('Page.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: buildPatchScript({
      seed: identity.noiseSeed,
      hardwareConcurrency: identity.hardwareConcurrency,
      deviceMemory: identity.deviceMemory,
      gpuVendor: identity.gpuVendor,
      gpuRenderer: identity.gpuRenderer,
      languages: identity.acceptLanguages.split(',').map((l) => l.split(';')[0]?.trim() ?? l),
      platform: 'Win32',
      clockOffsetMs: identity.clockOffsetMs,
      chromeMajor: identity.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? '0',
      dpr: identity.dpr,
      screenWidth: identity.screenWidth,
      screenHeight: identity.screenHeight,
      fonts: WINDOWS_FONT_ALLOWLIST,
    }),
  });

  // Ф-4.4 — UA і Client Hints задаються РАЗОМ. Окремо взятий UA-рядок
  // залишає navigator.userAgentData від Electron, і розбіжність між ними
  // є одним із найдешевших детекторів спуфінгу.
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: identity.userAgent,
    acceptLanguage: identity.acceptLanguages,
    platform: 'Win32',
    userAgentMetadata: buildMetadata(identity.platformVersion, identity.architecture, identity.uaPresetId, identity.uaVersionOffset),
  });

  // Ф-4.6 — таймзона й локаль відповідають країні exit-IP.
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: identity.timezone });
  await cdp.send('Emulation.setLocaleOverride', { locale: identity.locale });

  log.info({
    code: 'identity.applied',
    timezone: identity.timezone,
    locale: identity.locale,
    logicalWidth: identity.logicalWidth,
  });
}
