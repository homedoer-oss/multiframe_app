import { session } from 'electron';
import type { Profile, ProxyConfig } from '@shared/types';
import { partitionFor } from '../profile/ProfileManager';

export type AssignmentRefusal =
  | { allowed: true }
  | { allowed: false; reason: 'session_persisted' | 'storage_not_empty' };

/**
 * Ф-10.2 — ЗАПОБІЖНИК ДЛЯ ТЕСТОВИХ ПРОКСІ.
 *
 * Проксі класу `test` (з вкладки безкоштовних) можна призначити лише
 * профілю, який ОДНОЧАСНО:
 *   • має вимкнене збереження сесії, і
 *   • має порожнє сховище.
 *
 * Обґрунтування: значна частина публічних проксі існує для перехоплення
 * трафіку. Актив користувача — авторизовані сесії; вхід у цінний акаунт
 * через чужий безкоштовний проксі означає передачу сесії його оператору.
 * Вкладка призначена для перевірки працездатності застосунку,
 * а не для роботи з акаунтами.
 */
export async function canAssignProxy(profile: Profile, proxy: ProxyConfig): Promise<AssignmentRefusal> {
  if (proxy.class !== 'test') return { allowed: true };

  if (profile.persistSession) return { allowed: false, reason: 'session_persisted' };

  const empty = await isStorageEmpty(profile);
  if (!empty) return { allowed: false, reason: 'storage_not_empty' };

  return { allowed: true };
}

/** Наявність будь-яких cookies вважаємо ознакою непорожнього сховища. */
export async function isStorageEmpty(profile: Profile): Promise<boolean> {
  const ses = session.fromPartition(partitionFor(profile));
  const cookies = await ses.cookies.get({});
  return cookies.length === 0;
}
