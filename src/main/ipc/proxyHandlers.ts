import type { AssignResult, IpcInvokeMap } from '@shared/ipc';
import { PROXY_PROVIDERS, PROJECT_WALLETS, SUPPORT_UKRAINE_URL, UKRAINE_SECTION_ENABLED, UKRAINE_WALLETS } from '@shared/constants';
import { log } from '../logging/logger';
import { updateProfile } from '../profile/ProfileManager';
import { retargetRegion } from '../profile/identity';
import { DiscoveryRun, evaluateProxy, type CheckCandidate } from '../proxy/discovery';
import { canAssignProxy } from '../proxy/guards';
import { isVaultAvailable, setPassword } from '../proxy/credentials';
import { DEFAULT_CONCURRENCY, parseProxyList } from '../proxy/sources';
import type { Workspace } from '../window/Workspace';

type Emit = <T>(channel: string, data: T) => void;

let activeRun: DiscoveryRun | null = null;

/**
 * Ф-10.9 — перевірка виконується з ПРЯМОГО з'єднання користувача.
 * Реальна адреса потрібна для визначення прозорих проксі (Ф-10.12):
 * без неї неможливо помітити, що проксі підставляє її в заголовки.
 */
let realIp: string | null = null;

export function setRealIp(ip: string | null): void {
  realIp = ip;
}

export function buildProxyHandlers(
  getWorkspace: () => Workspace | null,
  emit: Emit,
  concurrency: () => number,
): Pick<
  { [C in keyof IpcInvokeMap]: (payload: IpcInvokeMap[C]['req']) => Promise<IpcInvokeMap[C]['res']> | IpcInvokeMap[C]['res'] },
  'proxy:evaluate' | 'proxy:assign' | 'proxy:importList' | 'proxy:discoverStart' | 'proxy:discoverStop' | 'proxy:providers' | 'support:wallets'
> {
  return {
    'proxy:evaluate': ({ config }) => evaluateProxy(config, realIp),

    'proxy:assign': async ({ profileId, config, password }): Promise<AssignResult> => {
      const profile = getWorkspace()?.profileOf(profileId);
      if (!profile) throw new Error(`Профіль ${profileId} не знайдено`);

      // Ф-10.2 — запобіжник для тестових (безкоштовних) проксі.
      const verdict = await canAssignProxy(profile, config);
      if (!verdict.allowed) {
        log.warn({ code: 'proxy.assign_refused', profileId, reason: verdict.reason, class: config.class });
        return { ok: false, reason: verdict.reason };
      }

      if (password) {
        // Ф-5.5 — пароль лише у захищене сховище Windows, ніколи у config.json.
        if (!isVaultAvailable()) return { ok: false, reason: 'credentials_unavailable' };
        setPassword(profileId, password);
      }

      // Ф-4.6 — таймзона, локаль і Accept-Language виводяться з країни
      // exit-IP щойно призначеного проксі, не з мови інтерфейсу. `direct`
      // не має exit-IP окремого від реальної адреси користувача — країна
      // обнуляється, а не лишається від попереднього проксі.
      let exitCountry: string | null = null;
      let identity = profile.identity;
      if (config.mode !== 'direct') {
        const quality = await evaluateProxy(config, realIp);
        if (quality?.country) {
          exitCountry = quality.country;
          identity = retargetRegion(profile.identity, quality.country);
        }
        // Проксі не пройшов перевірку зараз — це не привід відмовляти в
        // призначенні (Ф-3.6, kill-switch діє на рівні правил маршрутизації,
        // не цієї перевірки); просто немає чим оновити регіон цього разу.
      }

      updateProfile(profileId, {
        proxy: { ...config, hasPassword: Boolean(password) || config.hasPassword },
        exitCountry,
        identity,
      });
      log.info({ code: 'proxy.assigned', profileId, mode: config.mode, class: config.class, exitCountry });
      return { ok: true };
    },

    // Ф-3.11 — імпорт списку у форматі host:port[:user:pass].
    'proxy:importList': ({ text, mode }) => parseProxyList(text, mode).length,

    'proxy:discoverStart': async ({ text, mode }) => {
      activeRun?.cancel();

      // Ф-10.6 — джерела беруться з конфігурації. Поки перелік порожній,
      // єдиний спосіб отримати кандидатів — імпорт користувача.
      const candidates: CheckCandidate[] = text ? parseProxyList(text, mode) : [];
      if (candidates.length === 0) return 0;

      const run = new DiscoveryRun(
        candidates,
        concurrency(), // Ф-10.13 — стеля одночасних з'єднань
        realIp,
        (outcome) => {
          emit('proxy:discoveryResult', {
            host: outcome.candidate.host,
            port: outcome.candidate.port,
            mode: outcome.candidate.mode,
            quality: outcome.quality,
            rejected: outcome.rejected,
          });
        },
        (progress) => emit('proxy:discoveryProgress', progress),
      );

      activeRun = run;
      void run.run().finally(() => { if (activeRun === run) activeRun = null; });
      return candidates.length;
    },

    'proxy:discoverStop': () => {
      activeRun?.cancel();
      activeRun = null;
    },

    'proxy:providers': () => PROXY_PROVIDERS,

    'support:wallets': () => ({
      project: PROJECT_WALLETS,
      ukraine: UKRAINE_WALLETS,
      // Ф-13.22.2 — розділ вмикається лише після наповнення сторінки звіту.
      ukraineEnabled: UKRAINE_SECTION_ENABLED,
      reportUrl: SUPPORT_UKRAINE_URL,
    }),
  };
}

export { DEFAULT_CONCURRENCY };
