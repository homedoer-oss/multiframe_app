#!/usr/bin/env node --experimental-transform-types
/**
 * Ф-4.6 / Ф-10.21 — MaxMind GeoLite2 (рішення користувача 2026-08-02).
 *
 * Тут перевіряється лише те, що НЕ потребує реального ліцензійного ключа
 * чи мережі: побудова URL завантаження і евристика класифікації типу
 * підмережі за назвою ASN-організації. Обидва модулі (`geoip/pure.ts`,
 * `proxy/subnetHeuristic.ts`) свідомо без залежності від Electron саме
 * для того, щоб цей набір міг імпортувати їх напряму, без стабів і без
 * копіювання в тимчасову теку (на відміну від verify-cdp-session.mts,
 * якому довелось обходити реальну залежність CdpSession.ts від electron).
 *
 * НЕ перевіряється (і не може бути перевірено без реального ключа
 * MaxMind, якого в цьому середовищі немає): фактичне завантаження бази,
 * розпакування архіву, коректність .mmdb-пошуку для реальної IP-адреси.
 * Це задокументовано як відомий пробіл, а не замовчано.
 */
import { buildDownloadUrl, GEOIP_EDITIONS } from '../src/main/geoip/pure.ts';
import { classifySubnet } from '../src/main/proxy/subnetHeuristic.ts';

const t = (n: string, ok: boolean, extra = ''): number => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${extra ? '  (' + extra + ')' : ''}`);
  return ok ? 0 : 1;
};
let bad = 0;

console.log('\nПобудова URL завантаження:');
{
  const url = buildDownloadUrl('GeoLite2-ASN', 'testkey123');
  bad += t('хост — офіційний download.maxmind.com', url.startsWith('https://download.maxmind.com/app/geoip_download?'));
  bad += t('edition_id передається', url.includes('edition_id=GeoLite2-ASN'));
  bad += t('license_key передається', url.includes('license_key=testkey123'));
  bad += t('suffix=tar.gz — архів, не окремий .mmdb', url.includes('suffix=tar.gz'));

  const specialKeyUrl = buildDownloadUrl('GeoLite2-City', 'a+b/c=d');
  bad += t('спецсимволи ключа екрануються (URLSearchParams, не конкатенація)', !specialKeyUrl.includes('a+b/c=d') && specialKeyUrl.includes('license_key='));
}

console.log('\nОбидва видання визначені (ASN + City — Ф-10.21 потребує обох):');
{
  bad += t('GeoLite2-ASN у переліку', GEOIP_EDITIONS.includes('GeoLite2-ASN'));
  bad += t('GeoLite2-City у переліку', GEOIP_EDITIONS.includes('GeoLite2-City'));
  bad += t('рівно два видання', GEOIP_EDITIONS.length === 2, `${GEOIP_EDITIONS.length}`);
}

console.log('\nЕвристика типу підмережі (Ф-10.17) — відомі дата-центри:');
{
  bad += t('Amazon → datacenter', classifySubnet('Amazon.com, Inc.') === 'datacenter');
  bad += t('DigitalOcean → datacenter', classifySubnet('DigitalOcean, LLC') === 'datacenter');
  bad += t('OVH → datacenter', classifySubnet('OVH SAS') === 'datacenter');
  bad += t('Hetzner → datacenter', classifySubnet('Hetzner Online GmbH') === 'datacenter');
  bad += t('Cloudflare → datacenter', classifySubnet('Cloudflare, Inc.') === 'datacenter');
  bad += t('без урахування регістру', classifySubnet('AMAZON.COM, INC.') === 'datacenter');
}

console.log('\nВідомі мобільні оператори:');
{
  bad += t('Verizon Wireless → mobile', classifySubnet('Verizon Wireless') === 'mobile');
  bad += t('T-Mobile → mobile', classifySubnet('T-Mobile USA, Inc.') === 'mobile');
  bad += t('Vodafone → mobile', classifySubnet('Vodafone Limited') === 'mobile');
  bad += t('Kyivstar → mobile', classifySubnet('PJSC "Kyivstar"') === 'mobile');
}

console.log('\nНевідомі організації лишаються unknown, а НЕ вгадуються як residential:');
{
  bad += t('null → unknown', classifySubnet(null) === 'unknown');
  bad += t('порожній рядок → unknown', classifySubnet('') === 'unknown');
  bad += t('незнайома назва → unknown, не residential', classifySubnet('Bob\'s Regional ISP Co-op') === 'unknown');
  bad += t('"residential" ніколи не повертається евристикою', classifySubnet('Amazon.com, Inc.') !== 'residential'
    && classifySubnet("Bob's Regional ISP Co-op") !== 'residential');
}

console.log(`\nПроблем: ${bad}`);
console.log('НЕ перевірено (потребує реального ключа MaxMind): фактичне завантаження, розпакування, .mmdb-пошук.');
process.exit(bad === 0 ? 0 : 1);
