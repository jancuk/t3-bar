import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { PillApi, PillPayload } from '../shared/types';

const api: PillApi = {
  accept: (id) => ipcRenderer.send(IPC.clipboardAccept, id),
  dismiss: (id) => ipcRenderer.send(IPC.clipboardDismiss, id),
  ready: () => ipcRenderer.send(IPC.clipboardPillReady),
  onShow(cb) {
    const listener = (_event: unknown, payload: PillPayload) => cb(payload);
    ipcRenderer.on(IPC.clipboardShow, listener);
    return () => {
      ipcRenderer.removeListener(IPC.clipboardShow, listener);
    };
  },
};

contextBridge.exposeInMainWorld('t3pill', api);
