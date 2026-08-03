import type { IpcInvokeMap } from '@shared/ipc';
import { checkForUpdatesNow, getUpdateStatus, initAutoUpdater, installUpdateNow } from '../update/autoUpdater';

type Handlers = Pick<
  { [C in keyof IpcInvokeMap]: (p: IpcInvokeMap[C]['req']) => Promise<IpcInvokeMap[C]['res']> | IpcInvokeMap[C]['res'] },
  'update:getStatus' | 'update:check' | 'update:install'
>;

/** НФ-3.2 — автооновлення через GitHub Releases. */
export function buildUpdateHandlers(emit: <T>(channel: string, data: T) => void): Handlers {
  initAutoUpdater((status) => emit('update:status', status));

  return {
    'update:getStatus': () => getUpdateStatus(),
    'update:check': () => {
      checkForUpdatesNow();
    },
    'update:install': () => {
      installUpdateNow();
    },
  };
}
