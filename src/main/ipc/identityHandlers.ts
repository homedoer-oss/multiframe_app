import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { IpcInvokeMap } from '@shared/ipc';
import type { Profile } from '@shared/types';
import { MAX_PROFILES } from '@shared/constants';
import { COUNTRY_LOCALE } from '../identity/devices';
import { COLLECT_SCRIPT, analyse } from '../identity/selfCheck';
import { createBackup, readBackup, restoreStorage } from '../persistence/backup';
import { clearCacheOnly, partitionDir, profileDiskUsage } from '../persistence/storage';
import { getPassword, setPassword } from '../proxy/credentials';
import { deleteProfile, duplicateProfile, listProfiles, updateProfile } from '../profile/ProfileManager';
import { withRandomUaPreset, withUaPreset } from '../profile/identity';
import { updateConfig } from '../config/store';
import { log } from '../logging/logger';
import type { Workspace } from '../window/Workspace';

type Handlers = Pick<
  { [C in keyof IpcInvokeMap]: (p: IpcInvokeMap[C]['req']) => Promise<IpcInvokeMap[C]['res']> | IpcInvokeMap[C]['res'] },
  | 'identity:selfCheck' | 'identity:setUserAgent' | 'profile:backup' | 'profile:restoreBackup'
  | 'profile:diskUsage' | 'profile:clearCache' | 'profile:duplicate' | 'profile:delete'
>;

export function buildIdentityHandlers(getWorkspace: () => Workspace | null): Handlers {
  const resolve = (profileId: string) => {
    const ws = getWorkspace();
    const profile = ws?.profileOf(profileId);
    if (!ws || !profile) throw new Error(`Профіль ${profileId} не знайдено`);
    return { ws, profile };
  };

  return {
    'identity:selfCheck': async ({ profileId }) => {
      const { ws, profile } = resolve(profileId);
      const frame = ws.frame(profileId);
      const wc = frame?.activeWebContents();
      if (!wc) throw new Error('Фрейм не має активної вкладки');

      // executeJavaScript, а не CDP: Runtime.enable виявляється зі сторінки.
      const collected = (await wc.executeJavaScript(COLLECT_SCRIPT, true)) as Record<string, unknown>;

      // Ф-4.6 — очікувана таймзона виводиться з країни exit-IP, збереженої
      // на профілі під час `proxy:assign` (proxyHandlers.ts). Якщо проксі
      // ще не призначався або перевірка на той момент не повернула країну,
      // exitCountry лишається null і звіряти нема з чим — чесно, не вигадуємо.
      const expectedTz = profile.exitCountry ? (COUNTRY_LOCALE[profile.exitCountry]?.timezone ?? null) : null;

      const report = analyse(profileId, profile.identity, collected, expectedTz);
      log.info({ code: 'identity.self_check', profileId, failed: report.failed, warned: report.warned });
      return report;
    },

    /**
     * Запит користувача 2026-08-05 — ручний/автоматичний вибір User-Agent.
     * Живе перезастосування на вже відкритий фрейм (ws.reapplyIdentity) —
     * той самий Ф-3.6-подібний патерн, що й для проксі (2026-08-04): CDP
     * діє на МАЙБУТНІ навігації, тому повний ефект — після перезавантаження
     * вкладки, звідси renderer так само пропонує «Reload now».
     */
    'identity:setUserAgent': (req) => {
      const { ws, profile } = resolve(req.profileId);
      const identity = req.mode === 'auto'
        ? withRandomUaPreset(profile.identity)
        : withUaPreset(profile.identity, req.presetId, req.versionOffset);
      const updated = updateProfile(req.profileId, { identity, uaMode: req.mode });
      ws.reapplyIdentity(req.profileId, updated.identity);
      log.info({
        code: 'identity.ua_changed', profileId: req.profileId, mode: req.mode,
        uaPresetId: updated.identity.uaPresetId, uaVersionOffset: updated.identity.uaVersionOffset,
      });
      return updated;
    },

    'profile:backup': async ({ profileId, password, includeProxyPassword }) => {
      const { profile } = resolve(profileId);
      const proxyPassword = includeProxyPassword ? getPassword(profileId) : null;

      const container = createBackup(
        profile as unknown as { id: string; name: string; persistSession: boolean },
        partitionDir(profile),
        proxyPassword,
        password,
      );

      const safeName = profile.name.replace(/[^\p{L}\p{N}_-]+/gu, '_');
      const target = join(app.getPath('downloads'), `${safeName}-${Date.now()}.mfbackup`);
      writeFileSync(target, container);
      log.info({ code: 'profile.backup_created', profileId, bytes: container.length });
      return target;
    },

    /**
     * Відновлення з файлу (RECOMMENDATIONS §6). Створює НОВИЙ профіль —
     * навмисно persistSession: true, бо весь сенс операції в поверненні
     * авторизованих сесій. `readBackup` кидає BackupPasswordError на
     * хибний пароль чи підмінений шифротекст (перевірка тегом GCM).
     */
    'profile:restoreBackup': ({ fileBase64, password }) => {
      if (listProfiles().length >= MAX_PROFILES) {
        throw new Error(`Досягнуто межі профілів (${MAX_PROFILES}). Видаліть профіль перед відновленням.`);
      }

      const payload = readBackup(Buffer.from(fileBase64, 'base64'), password);
      // Ф-6.3 / persistence/backup.ts: попри вузький структурний тип
      // BackupProfile, у payload.profile лежить повний Profile — саме його
      // передає profile:backup виклик нижче. Тип тут навмисно ширший.
      const source = payload.profile as unknown as Profile;
      const id = randomUUID();

      const restored: Profile = {
        ...source,
        id,
        persistSession: true,
        proxy: { ...source.proxy, hasPassword: false },
      };

      if (payload.proxyPassword) {
        restored.proxy.hasPassword = setPassword(id, payload.proxyPassword);
      }

      const dir = join(app.getPath('userData'), 'Partitions', `profile-${id}`);
      mkdirSync(dir, { recursive: true });
      const restoredFiles = restoreStorage(payload, dir);

      updateConfig((cfg) => ({ ...cfg, profiles: [...cfg.profiles, restored] }));
      log.info({ code: 'profile.restored', profileId: id, fromName: source.name, files: restoredFiles });
      return restored;
    },

    'profile:diskUsage': ({ profileId }) => profileDiskUsage(resolve(profileId).profile),
    'profile:clearCache': ({ profileId }) => clearCacheOnly(resolve(profileId).profile),
    'profile:duplicate': ({ id }) => duplicateProfile(id),
    'profile:delete': ({ id }) => deleteProfile(id),
  };
}
