import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ipcMain } from 'electron';
import { IPC_INVOKE_CHANNELS, type IpcInvokeChannel, type IpcInvokeMap } from '@shared/ipc';
import type { AppSettings } from '@shared/types';
import { loadConfig, updateConfig } from '../config/store';
import { settingsSchema } from '../config/schema';
import { ensureProfiles, listProfiles, resetProfileData, updateProfile } from '../profile/ProfileManager';
import { log } from '../logging/logger';
import type { Workspace } from '../window/Workspace';
import { buildProxyHandlers } from './proxyHandlers';
import { buildIdentityHandlers } from './identityHandlers';
import { buildGeoipHandlers } from './geoipHandlers';
import { buildUpdateHandlers } from './updateHandlers';

/**
 * 2026-08-04 — `app.getVersion()` у розробницькому/тестовому запуску
 * (`electron out/main/index.js`, без окремого package.json поряд) не
 * знаходить package.json і мовчки віддає ВЕРСІЮ САМОГО ELECTRON
 * (підтверджено: `v33.4.11` замість `v0.1.1` — перевірено e2e-тестом,
 * tests/e2e/version-and-update.spec.ts). У пакованому застосунку
 * `app.getAppPath()` — корінь asar, де package.json є (files:
 * [out/**\/*, package.json], electron-builder.yml) і `app.getVersion()`
 * спрацював би коректно, але дублювати логіку версії для одного
 * контексту й покладатись на іншу для іншого — крихко. Явне читання
 * того самого package.json, який пакується РАЗОМ із out/ (той самий
 * відносний шлях від __dirname і в дев-режимі, і всередині asar),
 * працює однаково в обох.
 */
const APP_VERSION = (JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version: string }).version;

type Handler<C extends IpcInvokeChannel> = (
  payload: IpcInvokeMap[C]['req'],
) => Promise<IpcInvokeMap[C]['res']> | IpcInvokeMap[C]['res'];

type HandlerMap = { [C in IpcInvokeChannel]: Handler<C> };

export function registerIpc(
  getWorkspace: () => Workspace | null,
  emit: <T>(channel: string, data: T) => void,
): void {
  const workspace = (): Workspace => {
    const ws = getWorkspace();
    if (!ws) throw new Error('Робоча область ще не створена');
    return ws;
  };

  const proxyHandlers = buildProxyHandlers(
    getWorkspace,
    emit,
    () => loadConfig().settings.proxyCheckConcurrency,
  );

  const identityHandlers = buildIdentityHandlers(getWorkspace);
  const geoipHandlers = buildGeoipHandlers();
  const updateHandlers = buildUpdateHandlers(emit);

  const handlers: HandlerMap = {
    ...proxyHandlers,
    ...identityHandlers,
    ...geoipHandlers,
    ...updateHandlers,
    'app:getSettings': () => loadConfig().settings as AppSettings,

    'app:setSettings': (patch) => {
      const next = updateConfig((cfg) => ({
        ...cfg,
        settings: settingsSchema.parse({ ...cfg.settings, ...patch }),
      }));
      return next.settings as AppSettings;
    },

    'app:hasPreviousSession': () => loadConfig().lastSession !== null,
    'app:getVersion': () => APP_VERSION,

    'workspace:launch': async ({ profileCount, restorePrevious }) => {
      const profiles = ensureProfiles(profileCount, restorePrevious);
      // Ф-1.5 — відкриті адреси повертаються лише при увімкненому відновленні.
      const urls = restorePrevious ? (loadConfig().lastSession?.urls ?? {}) : {};
      await workspace().launch(profiles, urls);
      log.info({ code: 'workspace.launched', profileCount, restorePrevious });
      return profiles;
    },

    'workspace:close': () => {
      workspace().dispose();
    },

    'workspace:setCellRects': async (rects) => {
      await workspace().setCellRects(rects);
    },

    'workspace:maximizeFrame': ({ profileId }) => {
      workspace().maximize(profileId);
    },

    'workspace:setFramesVisible': ({ visible }) => {
      workspace().setAllFramesVisible(visible);
    },

    'workspace:tabPresence': () => workspace().tabPresence(),

    'frame:navigate': ({ profileId, url }) => {
      workspace().withFrame(profileId, (f) => f.navigate(url));
    },
    'frame:goBack': ({ profileId }) => workspace().goBack(profileId),
    'frame:goForward': ({ profileId }) => workspace().goForward(profileId),
    'frame:reload': ({ profileId }) => workspace().reload(profileId),
    'frame:stop': ({ profileId }) => {
      workspace().withActiveWebContents(profileId, (wc) => wc.stop());
    },
    'frame:setZoom': async ({ profileId, userZoom }) => {
      updateProfile(profileId, { userZoom });
      await workspace().setUserZoom(profileId, userZoom);
    },
    'frame:setPersistSession': ({ profileId, persistSession }) =>
      workspace().recreateFrame(profileId, persistSession),

    'frame:newTab': ({ profileId, url }) => {
      const frame = workspace().frame(profileId);
      if (!frame) throw new Error(`Фрейм ${profileId} не знайдено`);
      return frame.openTab(url);
    },
    'frame:closeTab': ({ profileId, tabId }) => {
      workspace().withFrame(profileId, (f) => f.closeTab(tabId));
    },
    'frame:activateTab': ({ profileId, tabId }) => {
      workspace().withFrame(profileId, (f) => f.activate(tabId));
    },
    // Ф-2.8 — DevTools відкриваються окремим вікном, щоб не займати комірку.
    'frame:openDevTools': ({ profileId }) => {
      workspace().withActiveWebContents(profileId, (wc) => wc.openDevTools({ mode: 'detach' }));
    },
    'frame:findInPage': ({ profileId, text, forward }) => {
      workspace().withActiveWebContents(profileId, (wc) => {
        if (text) wc.findInPage(text, { forward });
        else wc.stopFindInPage('clearSelection');
      });
    },
    'frame:stopFind': ({ profileId }) => {
      workspace().withActiveWebContents(profileId, (wc) => wc.stopFindInPage('clearSelection'));
    },
    'frame:focus': ({ profileId }) => {
      workspace().focus(profileId);
    },

    'profile:list': () => listProfiles(),
    'profile:update': ({ id, patch }) => updateProfile(id, patch),
    'profile:resetData': ({ id }) => resetProfileData(id),

    'shell:openExternal': ({ url }) => {
      void import('../window/Workspace').then((m) => m.Workspace.openExternal(url));
    },
  };

  for (const channel of IPC_INVOKE_CHANNELS) {
    ipcMain.handle(channel, async (_event, payload: unknown) => {
      try {
        return await (handlers[channel] as Handler<typeof channel>)(payload as never);
      } catch (err) {
        log.error({ code: 'ipc.handler_failed', channel, error: String(err) });
        throw err;
      }
    });
  }
}
