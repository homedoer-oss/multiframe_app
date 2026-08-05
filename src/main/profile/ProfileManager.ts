import { randomUUID } from 'node:crypto';
import { session, type Session } from 'electron';
import type { Profile } from '@shared/types';
import { PROFILE_COLOR_PALETTE } from '@shared/constants';
import { loadConfig, updateConfig } from '../config/store';
import { log } from '../logging/logger';
import { createIdentity, retargetRegion, withUaPreset } from './identity';

/**
 * АРХ-3 / Ф-5.1–5.3 — партиція визначає, чи переживають дані закриття застосунку.
 *   persistSession = true  → 'persist:profile-<id>'  дані на диску
 *   persistSession = false → 'profile-<id>'          лише в пам'яті, зникають
 *
 * Партицію не можна змінити в рантаймі — перемикання чекбокса вимагає
 * перестворення WebContentsView (Ф-5.4).
 */
export function partitionFor(profile: Profile): string {
  return profile.persistSession ? `persist:profile-${profile.id}` : `profile-${profile.id}`;
}

export function sessionFor(profile: Profile): Session {
  const ses = session.fromPartition(partitionFor(profile));

  // Ф-3.9 — WebRTC не повинен обходити проксі й розкривати реальний IP.
  // Політика застосовується до сесії одразу, ще до першої навігації.
  try {
    ses.setUserAgent(profile.identity.userAgent, profile.identity.acceptLanguages);
  } catch (err) {
    log.warn({ code: 'session.set_ua_failed', profileId: profile.id, error: String(err) });
  }
  return ses;
}

export function createProfile(index: number): Profile {
  return {
    id: randomUUID(),
    name: `Профіль ${index + 1}`,
    color: PROFILE_COLOR_PALETTE[index % PROFILE_COLOR_PALETTE.length] as string,
    startUrl: 'about:blank',
    persistSession: false,
    proxy: { mode: 'direct', host: '', port: 0, hasPassword: false, class: 'manual' },
    identity: createIdentity(),
    uaMode: 'auto',
    exitCountry: null,
    userZoom: 1,
    certificatePolicy: 'block',
    trustedFingerprints: [],
  };
}

export function listProfiles(): Profile[] {
  return loadConfig().profiles;
}

/** Створює або доповнює набір профілів до потрібної кількості. */
export function ensureProfiles(count: number, restore: boolean): Profile[] {
  return updateConfig((cfg) => {
    const existing = restore ? cfg.profiles : [];
    const profiles = [...existing];
    while (profiles.length < count) profiles.push(createProfile(profiles.length));
    return { ...cfg, profiles: profiles.slice(0, count) };
  }).profiles;
}

export function updateProfile(id: string, patch: Partial<Profile>): Profile {
  const next = updateConfig((cfg) => ({
    ...cfg,
    profiles: cfg.profiles.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p)),
  }));
  const found = next.profiles.find((p) => p.id === id);
  if (!found) throw new Error(`Профіль ${id} не знайдено`);
  return found;
}

/** Ф-5.8 — очищення сховища зі збереженням налаштувань проксі та ідентичності. */
export async function resetProfileData(id: string): Promise<void> {
  const profile = listProfiles().find((p) => p.id === id);
  if (!profile) return;
  await session.fromPartition(partitionFor(profile)).clearStorageData();
  log.info({ code: 'profile.data_reset', profileId: id });
}

/** Ф-6.2 — дублювання: ті самі налаштування, НОВА ідентичність. */
export function duplicateProfile(id: string): Profile {
  const source = listProfiles().find((p) => p.id === id);
  if (!source) throw new Error(`Профіль ${id} не знайдено`);

  // Копіювати ідентичність було б помилкою: два профілі з однаковим
  // fingerprint зводять нанівець сенс ізоляції (Ф-1.4). Але exitCountry
  // (проксі того самого джерела) копіюється — тож свіжу ідентичність
  // одразу ретаргетимо на той самий регіон, інакше timezone/locale
  // розійшлися б із уже відомою країною exit-IP (Ф-4.6).
  let freshIdentity = createIdentity();
  if (source.exitCountry) freshIdentity = retargetRegion(freshIdentity, source.exitCountry);
  // 2026-08-05 — ручний вибір UA (на відміну від решти ідентичності) —
  // свідоме рішення користувача, не випадкова властивість fingerprint,
  // тому копіюється разом із режимом 'manual'; 'auto' лишає свіжий
  // випадковий пресет із createIdentity() вище.
  if (source.uaMode === 'manual') freshIdentity = withUaPreset(freshIdentity, source.identity.uaPresetId);

  const copy: Profile = {
    ...source,
    id: randomUUID(),
    name: `${source.name} (копія)`,
    identity: freshIdentity,
    // Пароль не переноситься: він у safeStorage під ключем старого профілю.
    proxy: { ...source.proxy, hasPassword: false },
  };

  updateConfig((cfg) => ({ ...cfg, profiles: [...cfg.profiles, copy] }));
  log.info({ code: 'profile.duplicated', profileId: copy.id, sourceId: id });
  return copy;
}

export function deleteProfile(id: string): void {
  updateConfig((cfg) => ({ ...cfg, profiles: cfg.profiles.filter((p) => p.id !== id) }));
  log.info({ code: 'profile.deleted', profileId: id });
}

/**
 * Ф-6.3 — експорт конфігурації. Паролі проксі до експорту НЕ включаються:
 * це звичайний файл без шифрування. Для перенесення разом з авторизованими
 * сесіями призначений шифрований контейнер (persistence/backup.ts).
 */
export interface ProfileExport {
  version: 1;
  exportedAt: string;
  profiles: Profile[];
}

export function exportProfiles(ids?: string[]): ProfileExport {
  const all = listProfiles();
  const selected = ids ? all.filter((p) => ids.includes(p.id)) : all;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles: selected.map((p) => ({
      ...p,
      proxy: { ...p.proxy, username: undefined, hasPassword: false },
    })),
  };
}

export function importProfiles(data: ProfileExport): number {
  if (data.version !== 1) throw new Error(`Непідтримувана версія експорту: ${data.version}`);
  const incoming = data.profiles.map((p) => ({
    ...p,
    id: randomUUID(), // уникаємо колізій з наявними профілями
    proxy: { ...p.proxy, hasPassword: false },
  }));
  updateConfig((cfg) => ({ ...cfg, profiles: [...cfg.profiles, ...incoming] }));
  log.info({ code: 'profile.imported', count: incoming.length });
  return incoming.length;
}

/**
 * Ф-1.5 / Ф-1.6 — збереження стану сесії для відновлення.
 * Зберігаються лише профілі з увімкненим persistSession: решта за Ф-5.3
 * не має лишати слідів узагалі.
 */
export function saveLastSession(order: string[], urls: Record<string, string>): void {
  const persistable = new Set(listProfiles().filter((p) => p.persistSession).map((p) => p.id));
  updateConfig((cfg) => ({
    ...cfg,
    lastSession: {
      profileCount: order.length,
      order,
      urls: Object.fromEntries(Object.entries(urls).filter(([id]) => persistable.has(id))),
    },
  }));
}
