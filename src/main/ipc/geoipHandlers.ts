import type { IpcInvokeMap } from '@shared/ipc';
import { loadConfig, updateConfig } from '../config/store';
import { clearLicenseKey, getLicenseKey, hasLicenseKey, setLicenseKey } from '../geoip/credentials';
import { databasesPresent, downloadAllDatabases } from '../geoip/download';
import { createMaxMindProviderIfAvailable, setGeoAsnProvider } from '../proxy/geoip';
import { log } from '../logging/logger';

type Handlers = Pick<
  { [C in keyof IpcInvokeMap]: (p: IpcInvokeMap[C]['req']) => Promise<IpcInvokeMap[C]['res']> | IpcInvokeMap[C]['res'] },
  'geoip:getStatus' | 'geoip:setLicenseKey' | 'geoip:downloadDatabases'
>;

/** Ф-4.6 / Ф-10.21 — керування локальною базою MaxMind GeoLite2 з Settings. */
export function buildGeoipHandlers(): Handlers {
  return {
    'geoip:getStatus': () => ({
      hasLicenseKey: hasLicenseKey(),
      hasDatabases: databasesPresent(),
      lastUpdated: loadConfig().settings.geoipLastUpdated,
    }),

    'geoip:setLicenseKey': ({ licenseKey }) => {
      const trimmed = licenseKey.trim();
      if (!trimmed) {
        clearLicenseKey();
        return { ok: true };
      }
      return { ok: setLicenseKey(trimmed) };
    },

    'geoip:downloadDatabases': async () => {
      const key = getLicenseKey();
      if (!key) return { ok: false, error: 'Ліцензійний ключ не збережено' };

      const result = await downloadAllDatabases(key);
      if (!result.ok) return { ok: false, error: result.error };

      updateConfig((cfg) => ({
        ...cfg,
        settings: { ...cfg.settings, geoipLastUpdated: result.updatedAt ?? new Date().toISOString() },
      }));

      // Перезавантажена база — переактивувати провайдера одразу,
      // без очікування наступного запуску застосунку.
      const provider = createMaxMindProviderIfAvailable();
      if (provider) setGeoAsnProvider(provider);
      log.info({ code: 'geoip.provider_activated' });

      return { ok: true };
    },
  };
}
