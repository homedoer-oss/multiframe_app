import type { ProxyConfig, ProxyQuality } from '@shared/types';
import { log } from '../logging/logger';
import { DEFAULT_PROBE, detectAnonymity, extractExitIp, probe } from './checker';
import { lookupGeoAsn } from './geoip';
import { scoreProxy } from './scoring';

export interface CheckCandidate {
  host: string;
  port: number;
  mode: 'https' | 'socks5';
}

export interface CheckOutcome {
  candidate: CheckCandidate;
  quality: ProxyQuality | null;
  rejected: 'unreachable' | 'transparent' | null;
  error?: string;
}

export interface DiscoveryProgress {
  total: number;
  done: number;
  accepted: number;
  rejectedTransparent: number;
}

/**
 * Ф-10.11 — конвеєр перевірки. Ф-10.13 — обмеження одночасних з'єднань:
 * без нього масова перевірка сприймається обладнанням провайдера
 * як сканування портів.
 *
 * Ф-10.14 — часткові результати доступні одразу через onResult,
 * не чекаючи завершення всієї черги.
 */
export class DiscoveryRun {
  private cancelled = false;
  private done = 0;
  private accepted = 0;
  private rejectedTransparent = 0;

  constructor(
    private readonly candidates: CheckCandidate[],
    private readonly concurrency: number,
    private readonly realIp: string | null,
    private readonly onResult: (outcome: CheckOutcome) => void,
    private readonly onProgress: (progress: DiscoveryProgress) => void,
  ) {}

  /** Ф-10.14 — зупинка в будь-який момент. */
  cancel(): void {
    this.cancelled = true;
  }

  async run(): Promise<void> {
    const queue = [...this.candidates];
    const workers = Array.from({ length: Math.min(this.concurrency, queue.length) }, async () => {
      while (!this.cancelled) {
        const candidate = queue.shift();
        if (!candidate) return;
        const outcome = await this.checkOne(candidate);
        if (this.cancelled) return;

        if (outcome.rejected === 'transparent') this.rejectedTransparent++;
        else if (outcome.quality) this.accepted++;
        this.done++;

        this.onResult(outcome);
        this.onProgress({
          total: this.candidates.length,
          done: this.done,
          accepted: this.accepted,
          rejectedTransparent: this.rejectedTransparent,
        });
      }
    });

    await Promise.all(workers);
    log.info({
      code: 'discovery.finished',
      total: this.candidates.length,
      accepted: this.accepted,
      rejectedTransparent: this.rejectedTransparent,
      cancelled: this.cancelled,
    });
  }

  private async checkOne(candidate: CheckCandidate): Promise<CheckOutcome> {
    const config: ProxyConfig = {
      mode: candidate.mode,
      host: candidate.host,
      port: candidate.port,
      hasPassword: false,
      class: 'test',
    };

    // Кроки 2–4: доступність, рукостискання, exit-IP.
    const result = await probe(config, DEFAULT_PROBE);
    if (!result.ok || !result.body) {
      return { candidate, quality: null, rejected: 'unreachable', error: result.error };
    }

    const exitIp = extractExitIp(result.body);

    // Крок 5: рівень анонімності.
    const anonymity = detectAnonymity(result.body, this.realIp);

    // Ф-10.12 — прозорі проксі відхиляються беззастережно і не потрапляють
    // до списку в жодному вигляді: вони розкривають реальну адресу
    // користувача цільовому сайту.
    if (anonymity === 'transparent') {
      log.info({ code: 'discovery.rejected_transparent', host: candidate.host, port: candidate.port });
      return { candidate, quality: null, rejected: 'transparent' };
    }

    // Крок 6: ASN, тип підмережі, чорні списки.
    const geo = exitIp ? await lookupGeoAsn(exitIp) : {
      country: null, city: null, asn: null, operator: null, subnet: 'unknown' as const, blacklists: [],
    };

    const partial: Omit<ProxyQuality, 'score'> = {
      exitIp: exitIp ?? `${candidate.host}:${candidate.port}`,
      country: geo.country,
      city: geo.city,
      asn: geo.asn,
      operator: geo.operator,
      subnet: geo.subnet,
      anonymity,
      latencyMs: result.latencyMs ?? null,
      blacklists: geo.blacklists,
      checkedAt: new Date().toISOString(), // Ф-10.18
    };

    return { candidate, quality: { ...partial, score: scoreProxy(partial) }, rejected: null };
  }
}

/**
 * Ф-10.15 — движок оцінки спільний: застосовується однаково до проксі
 * з вкладки безкоштовних, введених вручну та імпортованих списком.
 */
export async function evaluateProxy(config: ProxyConfig, realIp: string | null): Promise<ProxyQuality | null> {
  const result = await probe(config);
  if (!result.ok || !result.body) return null;

  const exitIp = extractExitIp(result.body);
  const anonymity = detectAnonymity(result.body, realIp);
  const geo = exitIp ? await lookupGeoAsn(exitIp) : {
    country: null, city: null, asn: null, operator: null, subnet: 'unknown' as const, blacklists: [],
  };

  const partial: Omit<ProxyQuality, 'score'> = {
    exitIp: exitIp ?? `${config.host}:${config.port}`,
    country: geo.country, city: geo.city, asn: geo.asn, operator: geo.operator,
    subnet: geo.subnet, anonymity,
    latencyMs: result.latencyMs ?? null,
    blacklists: geo.blacklists,
    checkedAt: new Date().toISOString(),
  };
  return { ...partial, score: scoreProxy(partial) };
}
