import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_EVENT_CHANNELS,
  IPC_INVOKE_CHANNELS,
  type IpcEventChannel,
  type IpcInvokeChannel,
  type MultiFrameApi,
} from '@shared/ipc';

/**
 * НФ-2.1 — жодних Node-API в контексті renderer.
 * Пропускаються лише канали з білого переліку контракту.
 */
const api: MultiFrameApi = {
  invoke: (channel, payload) => {
    if (!(IPC_INVOKE_CHANNELS as readonly string[]).includes(channel)) {
      return Promise.reject(new Error(`Невідомий IPC-канал: ${String(channel)}`));
    }
    return ipcRenderer.invoke(channel as IpcInvokeChannel, payload);
  },
  on: (channel, listener) => {
    if (!(IPC_EVENT_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`Невідомий IPC-канал події: ${String(channel)}`);
    }
    const wrapped = (_e: unknown, data: unknown): void => listener(data as never);
    ipcRenderer.on(channel as IpcEventChannel, wrapped);
    return () => ipcRenderer.removeListener(channel as IpcEventChannel, wrapped);
  },
};

contextBridge.exposeInMainWorld('multiframe', api);
