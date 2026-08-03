import type { MultiFrameApi } from '@shared/ipc';

declare global {
  interface Window {
    multiframe: MultiFrameApi;
  }
}
export {};
