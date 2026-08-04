#!/usr/bin/env node --experimental-transform-types
/**
 * Регресія для classifyFailure (Ф-2.4). Чиста функція, без Electron.
 *
 * 2026-08-04 — попередній набір PROXY_CODES звірено з живим net_error_list.h
 * (не з пам'яті) і виявився частково неточним: -136/-336/-369 насправді
 * позначали ІНШІ помилки (або не існують узагалі), а ключовий -111
 * (TUNNEL_CONNECTION_FAILED — саме той, що бачить користувач через реальний
 * HTTPS-проксі, errors.ts) взагалі був відсутній у списку й падав у
 * загальну категорію 'network'. Цей тест фіксує звірений набір, щоб
 * майбутня зміна не повернула здогад замість перевіреного значення.
 */
import { classifyFailure } from '../src/main/window/errors.ts';

const t = (n: string, ok: boolean): number => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}`);
  return ok ? 0 : 1;
};
let bad = 0;

console.log('\nКоди, звірені з net_error_list.h як проксі-специфічні → \'proxy\':');
bad += t('-111 ERR_TUNNEL_CONNECTION_FAILED', classifyFailure(-111) === 'proxy');
bad += t('-115 ERR_PROXY_AUTH_UNSUPPORTED', classifyFailure(-115) === 'proxy');
bad += t('-120 ERR_SOCKS_CONNECTION_FAILED', classifyFailure(-120) === 'proxy');
bad += t('-121 ERR_SOCKS_CONNECTION_HOST_UNREACHABLE', classifyFailure(-121) === 'proxy');
bad += t('-127 ERR_PROXY_AUTH_REQUESTED', classifyFailure(-127) === 'proxy');
bad += t('-130 ERR_PROXY_CONNECTION_FAILED', classifyFailure(-130) === 'proxy');
bad += t('-131 ERR_MANDATORY_PROXY_CONFIGURATION_FAILED', classifyFailure(-131) === 'proxy');
bad += t('-136 ERR_PROXY_CERTIFICATE_INVALID', classifyFailure(-136) === 'proxy');
bad += t('-186 ERR_PROXY_UNABLE_TO_CONNECT_TO_DESTINATION', classifyFailure(-186) === 'proxy');
bad += t('-336 ERR_NO_SUPPORTED_PROXIES', classifyFailure(-336) === 'proxy');
bad += t('-364 ERR_PROXY_AUTH_REQUESTED_WITH_NO_CONNECTION', classifyFailure(-364) === 'proxy');

console.log('\n-369 більше не в списку (у живому джерелі такого коду не існує):');
bad += t('-369 → \'network\', не \'proxy\'', classifyFailure(-369) === 'network');

console.log('\nЗвичайні мережеві й сертифікатні коди лишаються поза \'proxy\':');
bad += t('-102 ERR_CONNECTION_REFUSED → network', classifyFailure(-102) === 'network');
bad += t('-105 ERR_NAME_NOT_RESOLVED → network', classifyFailure(-105) === 'network');
bad += t('-200 (діапазон сертифікатів) → certificate', classifyFailure(-200) === 'certificate');
bad += t('-219 (кінець діапазону сертифікатів) → certificate', classifyFailure(-219) === 'certificate');
bad += t('-220 (за межами діапазону сертифікатів) → network', classifyFailure(-220) === 'network');

console.log(`\nПроблем: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
