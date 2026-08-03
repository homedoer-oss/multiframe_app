import { app, type Session, type WebContents } from 'electron';
import type { Profile, ProxyConfig } from '@shared/types';
import { log } from '../logging/logger';
import { ownerOf } from '../window/Frame';
import { getPassword } from './credentials';
import { Socks5Relay, relayProxyRule } from './Socks5Relay';

interface Binding {
  profileId: string;
  relay: Socks5Relay | null;
  healthy: boolean;
}

const bindings = new Map<string, Binding>();

/**
 * Ф-3.7 — ЗАБОРОНА FALLBACK.
 *
 * Правила проксі не містять DIRECT у ланцюжку. Chromium переходить на
 * пряме з'єднання лише тоді, коли воно явно присутнє в proxyRules —
 * тому kill-switch (Ф-3.8) забезпечується структурою правил, а не
 * обробкою помилок. Додавання ",direct" сюди зламало б увесь продукт.
 *
 * proxyBypassRules "<-loopback>" знімає неявний виняток для localhost:
 * інакше локальні адреси йшли б повз проксі.
 */
function buildRules(config: ProxyConfig, relayRule: string | null): { proxyRules: string; proxyBypassRules: string } {
  if (relayRule) return { proxyRules: relayRule, proxyBypassRules: '<-loopback>' };

  const endpoint = `${config.host}:${config.port}`;
  switch (config.mode) {
    case 'https':
      // Один запис без схеми застосовується до всіх протоколів.
      return { proxyRules: endpoint, proxyBypassRules: '<-loopback>' };
    case 'socks5':
      return { proxyRules: `socks5://${endpoint}`, proxyBypassRules: '<-loopback>' };
    default:
      return { proxyRules: '', proxyBypassRules: '' };
  }
}

/** Ф-3.6 — зміна застосовується після перезавантаження фрейму. */
export async function applyProxy(profile: Profile, session: Session): Promise<void> {
  await releaseProxy(profile.id);

  const { proxy } = profile;
  if (proxy.mode === 'direct') {
    await session.setProxy({ mode: 'direct' });
    bindings.set(profile.id, { profileId: profile.id, relay: null, healthy: true });
    log.info({ code: 'proxy.applied', profileId: profile.id, mode: 'direct' });
    return;
  }

  let relayRule: string | null = null;
  let relay: Socks5Relay | null = null;

  // Ф-3.3 — Chromium не вміє SOCKS5 з логіном/паролем, піднімаємо relay.
  if (proxy.mode === 'socks5' && proxy.hasPassword) {
    const password = getPassword(profile.id);
    if (password === null) {
      log.error({ code: 'proxy.credentials_missing', profileId: profile.id });
      markUnhealthy(profile.id);
      // Проксі лишається налаштованим: без пароля фрейм має впасти в помилку,
      // а не піти напряму.
      await session.setProxy(buildRules(proxy, `socks5://${proxy.host}:${proxy.port}`));
      return;
    }

    relay = new Socks5Relay(
      { host: proxy.host, port: proxy.port, username: proxy.username, password },
      (err) => {
        // Ф-3.4 — падіння relay переводить профіль у стан помилки, а не в direct.
        log.error({ code: 'proxy.relay_failure', profileId: profile.id, error: err.message });
        markUnhealthy(profile.id);
      },
    );
    const address = await relay.start();
    relayRule = relayProxyRule(address);
    log.info({ code: 'proxy.relay_started', profileId: profile.id, port: address.port });
  }

  const rules = buildRules(proxy, relayRule);
  // setProxy повертає проміс, який резолвиться після застосування правил,
  // тож окреме перезавантаження налаштувань не потрібне. За Ф-3.6 зміна
  // проксі й так набуває чинності після перезавантаження фрейму.
  await session.setProxy(rules);

  bindings.set(profile.id, { profileId: profile.id, relay, healthy: true });
  log.info({ code: 'proxy.applied', profileId: profile.id, mode: proxy.mode, viaRelay: relayRule !== null });
}

export async function releaseProxy(profileId: string): Promise<void> {
  const binding = bindings.get(profileId);
  binding?.relay?.stop();
  bindings.delete(profileId);
}

export function markUnhealthy(profileId: string): void {
  const binding = bindings.get(profileId);
  if (binding) binding.healthy = false;
}

export function isHealthy(profileId: string): boolean {
  return bindings.get(profileId)?.healthy ?? true;
}

/**
 * Ф-3.2 — автентифікація HTTP/HTTPS-проксі. Chromium її підтримує,
 * тому relay тут не потрібен: достатньо відповісти на подію login.
 */
export function installProxyAuthHandler(lookup: (profileId: string) => Profile | undefined): void {
  app.on('login', (event, webContents: WebContents, _request, authInfo, callback) => {
    if (!authInfo.isProxy) return; // автентифікація сайту — не наша справа

    const profileId = ownerOf(webContents);
    const profile = profileId ? lookup(profileId) : undefined;
    if (!profile || !profile.proxy.username) return;

    const password = getPassword(profile.id);
    if (password === null) {
      log.error({ code: 'proxy.auth_no_password', profileId: profile.id });
      return; // без виклику callback Chromium відхилить запит — і це правильно
    }

    event.preventDefault();
    log.info({ code: 'proxy.auth_provided', profileId: profile.id });
    callback(profile.proxy.username, password);
  });
}
