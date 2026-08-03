import { open, type Reader } from 'maxmind';
import type { AsnResponse, CityResponse } from 'mmdb-lib';
import type { SubnetType } from '@shared/types';
import { log } from '../logging/logger';
import { databasesPresent, mmdbPath } from '../geoip/download';
import { classifySubnet } from './subnetHeuristic';

export { classifySubnet };

export interface GeoAsnRecord {
  country: string | null;
  city: string | null;
  asn: string | null;
  operator: string | null;
  subnet: SubnetType;
  blacklists: string[];
}

/**
 * Ф-10.21 — джерело довідника обирається в налаштуваннях і має варіант
 * з локальною базою для роботи без зовнішніх запитів.
 *
 * Ф-10.20 — назовні йдуть лише адреси перевірюваних проксі. Конфігурація
 * користувача, його платні проксі та статистика використання НЕ передаються.
 */
export interface GeoAsnProvider {
  readonly id: string;
  readonly requiresNetwork: boolean;
  lookup(ip: string): Promise<GeoAsnRecord>;
}

const EMPTY: GeoAsnRecord = {
  country: null, city: null, asn: null, operator: null,
  subnet: 'unknown', blacklists: [],
};

/**
 * Заглушка за замовчуванням: нічого не знає і нікуди не ходить.
 * Свідомо обрана типовою — застосунок не має робити зовнішніх запитів,
 * поки користувач явно не обрав провайдера довідника.
 */
export class NullGeoAsnProvider implements GeoAsnProvider {
  readonly id = 'none';
  readonly requiresNetwork = false;
  async lookup(): Promise<GeoAsnRecord> {
    return { ...EMPTY };
  }
}

/**
 * Ф-4.6 / Ф-10.21 — локальна база MaxMind GeoLite2, рішення користувача
 * 2026-08-02. Два видання: City (країна, місто) і ASN (номер, оператор).
 * Файли постачаються окремим завантаженням (`geoip/download.ts`) за
 * ліцензійним ключем, який користувач вводить сам — жодна база не входить
 * до дистрибутиву (умови ліцензії MaxMind не дозволяють переносити її без
 * прив'язки до облікового запису конкретного користувача).
 *
 * `blacklists` НЕ реалізовано — це окрема функція (перевірка DNSBL),
 * не частина рішення про geoip-базу. Завжди повертає `[]`, чесно, а не
 * мовчки прикидається перевіреним.
 */
export class MaxMindGeoAsnProvider implements GeoAsnProvider {
  readonly id = 'maxmind';
  readonly requiresNetwork = false;
  private cityReader: Reader<CityResponse> | null = null;
  private asnReader: Reader<AsnResponse> | null = null;
  private loading: Promise<void> | null = null;

  private async ensureLoaded(): Promise<void> {
    if (this.cityReader && this.asnReader) return;
    if (!this.loading) {
      this.loading = (async () => {
        this.cityReader = await open<CityResponse>(mmdbPath('GeoLite2-City'));
        this.asnReader = await open<AsnResponse>(mmdbPath('GeoLite2-ASN'));
      })().catch((err) => {
        log.error({ code: 'geoip.mmdb_open_failed', error: String(err) });
        this.loading = null;
        throw err;
      });
    }
    await this.loading;
  }

  async lookup(ip: string): Promise<GeoAsnRecord> {
    try {
      await this.ensureLoaded();
    } catch {
      return { ...EMPTY };
    }
    const city = this.cityReader?.get(ip) ?? null;
    const asn = this.asnReader?.get(ip) ?? null;
    const operator = asn?.autonomous_system_organization ?? null;

    return {
      country: city?.country?.iso_code ?? null,
      city: city?.city?.names.en ?? null,
      asn: asn ? `AS${asn.autonomous_system_number}` : null,
      operator,
      subnet: classifySubnet(operator),
      // Не реалізовано — окрема функція (DNSBL), не частина geoip-бази.
      blacklists: [],
    };
  }
}

/** Провайдер активний лише коли обидва файли бази вже завантажені. */
export function createMaxMindProviderIfAvailable(): GeoAsnProvider | null {
  return databasesPresent() ? new MaxMindGeoAsnProvider() : null;
}

let active: GeoAsnProvider = new NullGeoAsnProvider();

export function setGeoAsnProvider(provider: GeoAsnProvider): void {
  active = provider;
}

export function lookupGeoAsn(ip: string): Promise<GeoAsnRecord> {
  return active.lookup(ip);
}
