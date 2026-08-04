import type { FrameErrorKind } from '@shared/types';

/**
 * Класифікація помилок Chromium у категорії, які оболонка вміє показати
 * локалізованим текстом (Ф-2.4, Ф-8.18).
 *
 * Коди: https://source.chromium.org/chromium/chromium/src/+/main:net/base/net_error_list.h
 *
 * 2026-08-04 — попередній набір (-130/-131/-136/-336/-369) звірено з живим
 * джерелом і виявлено НЕТОЧНИМ: -136 насправді PROXY_CERTIFICATE_INVALID,
 * не PROXY_AUTH_UNSUPPORTED (та — -115); -336 насправді NO_SUPPORTED_PROXIES,
 * не TUNNEL_CONNECTION_FAILED (та — -111, ключовий код, якого взагалі не
 * було в списку — саме його побачив користувач для https://2ip.io/ через
 * реальний HTTPS-проксі, класифікованим як звичайна мережева помилка);
 * -369 узагалі не існує в актуальному net_error_list.h (правильний код
 * PROXY_AUTH_REQUESTED_WITH_NO_CONNECTION — -364). Переписано з нуля за
 * фактичним вмістом файлу, а не за попереднім (неперевіреним) здогадом.
 */
const PROXY_CODES = new Set([
  -111, // ERR_TUNNEL_CONNECTION_FAILED — CONNECT-тунель через проксі не встановився
  -115, // ERR_PROXY_AUTH_UNSUPPORTED
  -120, // ERR_SOCKS_CONNECTION_FAILED
  -121, // ERR_SOCKS_CONNECTION_HOST_UNREACHABLE
  -127, // ERR_PROXY_AUTH_REQUESTED
  -130, // ERR_PROXY_CONNECTION_FAILED
  -131, // ERR_MANDATORY_PROXY_CONFIGURATION_FAILED
  -136, // ERR_PROXY_CERTIFICATE_INVALID
  -186, // ERR_PROXY_UNABLE_TO_CONNECT_TO_DESTINATION
  -336, // ERR_NO_SUPPORTED_PROXIES
  -364, // ERR_PROXY_AUTH_REQUESTED_WITH_NO_CONNECTION
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
