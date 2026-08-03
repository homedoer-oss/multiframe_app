import type { FrameErrorKind } from '@shared/types';

/**
 * Класифікація помилок Chromium у категорії, які оболонка вміє показати
 * локалізованим текстом (Ф-2.4, Ф-8.18).
 *
 * Коди: https://source.chromium.org/chromium/chromium/src/+/main:net/base/net_error_list.h
 */
const PROXY_CODES = new Set([
  -130, // ERR_PROXY_CONNECTION_FAILED
  -131, // ERR_MANDATORY_PROXY_CONFIGURATION_FAILED
  -136, // ERR_PROXY_AUTH_UNSUPPORTED
  -336, // ERR_TUNNEL_CONNECTION_FAILED
  -369, // ERR_PROXY_AUTH_REQUESTED_WITH_NO_CONNECTION
]);

/** Діапазон помилок сертифікатів у Chromium: від -200 до -219. */
function isCertificate(code: number): boolean {
  return code <= -200 && code >= -219;
}

export function classifyFailure(code: number): FrameErrorKind {
  if (PROXY_CODES.has(code)) return 'proxy';
  if (isCertificate(code)) return 'certificate';
  return 'network';
}
