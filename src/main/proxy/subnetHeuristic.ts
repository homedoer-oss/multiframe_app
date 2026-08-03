import type { SubnetType } from '@shared/types';

/**
 * Ключові слова в `autonomous_system_organization` для класифікації типу
 * підмережі. Навмисно ОДНОБІЧНА евристика: розпізнає лише явно відомі
 * дата-центри й мобільних операторів. Усе інше лишається `unknown`, а не
 * вгадується як `residential` — так само, як увесь інший шар маскування
 * НЕ імітує дані, яких насправді не знає (§5.14-суміжний принцип).
 * Список неповний і не претендує на вичерпність; хибні негативи (пропущений
 * дата-центр під невідомою назвою) безпечніші за хибні позитиви.
 *
 * Без залежності від Electron навмисно — щоб `scripts/verify-geoip.mts`
 * міг перевірити евристику напряму, без стабів чи копіювання у тимчасову теку.
 */
const DATACENTER_KEYWORDS = [
  'amazon', 'aws', 'google cloud', 'google llc', 'microsoft azure', 'microsoft corporation',
  'digitalocean', 'linode', 'vultr', 'ovh', 'hetzner', 'contabo', 'choopa', 'leaseweb',
  'scaleway', 'oracle cloud', 'alibaba', 'tencent cloud', 'hostinger', 'godaddy',
  'cloudflare', 'akamai', 'fastly', 'rackspace', 'ionos', 'psychz', 'quadranet',
  'colocrossing', 'wholesale internet', 'datacamp', 'stackpath', 'm247', 'g-core',
  'hosting', 'datacenter', 'data center', 'server',
];

const MOBILE_KEYWORDS = [
  'verizon wireless', 't-mobile', 'at&t mobility', 'sprint', 'vodafone', 'orange sa',
  'telefonica', 'china mobile', 'china unicom', 'china telecom', 'kyivstar', 'lifecell',
  'claro', 'movistar', 'telstra', 'optus', 'rogers wireless', 'bell mobility',
  'telus mobility', 'sk telecom', 'kt corporation', 'ntt docomo', 'softbank corp',
  'mtn group', 'airtel', 'cellular',
];

/**
 * Ф-10.17 — евристика класифікації типу підмережі за назвою організації
 * ASN. НЕ звертання до мережі, НЕ окрема база — чиста функція над рядком,
 * який уже дає MaxMind ASN-видання.
 */
export function classifySubnet(asnOrganization: string | null): SubnetType {
  if (!asnOrganization) return 'unknown';
  const lower = asnOrganization.toLowerCase();
  if (DATACENTER_KEYWORDS.some((kw) => lower.includes(kw))) return 'datacenter';
  if (MOBILE_KEYWORDS.some((kw) => lower.includes(kw))) return 'mobile';
  return 'unknown';
}
