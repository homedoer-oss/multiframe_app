import type { AnonymityLevel, ProxyQuality, SubnetType } from '@shared/types';

/**
 * Ф-10.17 — тип підмережі та присутність у чорних списках мають
 * НАЙБІЛЬШУ вагу, вищу за швидкість.
 *
 * Обґрунтування — RECOMMENDATIONS.md §1: на практиці більшість блокувань
 * спричиняє репутація IP, а не fingerprint. Швидкий датацентровий проксі
 * з поганою репутацією має оцінюватись гірше за повільний резидентний.
 */
const SUBNET_WEIGHT: Record<SubnetType, number> = {
  mobile: 40,
  residential: 35,
  unknown: 12,
  datacenter: 5,
};

const ANONYMITY_WEIGHT: Record<AnonymityLevel, number> = {
  elite: 25,
  anonymous: 15,
  unknown: 5,
  transparent: 0, // не має потрапити до списку взагалі (Ф-10.12)
};

function latencyScore(latencyMs: number | null): number {
  if (latencyMs === null) return 0;
  if (latencyMs < 300) return 15;
  if (latencyMs < 800) return 11;
  if (latencyMs < 1500) return 7;
  if (latencyMs < 3000) return 3;
  return 1;
}

/** Свіжість результату: Ф-10.18 — публічний проксі живе хвилини. */
function freshnessScore(checkedAt: string): number {
  const ageMin = (Date.now() - Date.parse(checkedAt)) / 60_000;
  if (Number.isNaN(ageMin)) return 0;
  if (ageMin < 5) return 20;
  if (ageMin < 15) return 14;
  if (ageMin < 60) return 7;
  return 0;
}

export function scoreProxy(q: Omit<ProxyQuality, 'score'>): number {
  if (q.anonymity === 'transparent') return 0;

  const blacklistPenalty = Math.min(q.blacklists.length * 15, 45);
  const raw =
    SUBNET_WEIGHT[q.subnet] +
    ANONYMITY_WEIGHT[q.anonymity] +
    latencyScore(q.latencyMs) +
    freshnessScore(q.checkedAt) -
    blacklistPenalty;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

export type Verdict = 'good' | 'usable' | 'risky' | 'unusable';

export function verdict(score: number): Verdict {
  if (score >= 70) return 'good';
  if (score >= 45) return 'usable';
  if (score >= 20) return 'risky';
  return 'unusable';
}
