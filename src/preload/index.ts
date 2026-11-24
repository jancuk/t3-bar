import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { AppState, PrefillPayload, T3BarApi } from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  // The IpcRendererEvent is never passed to the page.
  const listener = (_event: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: T3BarApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  checkHealth: () => ipcRenderer.invoke(IPC.healthCheck),
  listThreads: (targetId) => ipcRenderer.invoke(IPC.threadsList, targetId),
  showThread: (targetId, threadId, count) => ipcRenderer.invoke(IPC.threadsShow, targetId, threadId, count),
  sendMessage: (targetId, threadId, text) => ipcRenderer.invoke(IPC.threadsSend, targetId, threadId, text),
  startThread: (targetId, text, title) => ipcRenderer.invoke(IPC.threadsStart, targetId, text, title),
  openThread: (link) => ipcRenderer.invoke(IPC.threadsOpen, link),
  addFolder: () => ipcRenderer.invoke(IPC.projectsAddFolder),
  scanFolder: () => ipcRenderer.invoke(IPC.projectsScan),
  removeProject: (id) => ipcRenderer.invoke(IPC.projectsRemove, id),
  openProjectInApp: (targetId) => ipcRenderer.invoke(IPC.projectsOpenInApp, targetId),
  copyText: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  setPinned: (pinned) => ipcRenderer.invoke(IPC.windowSetPinned, pinned),
  enableClipboard: () => ipcRenderer.invoke(IPC.clipboardEnable),
  recheckClipboard: () => ipcRenderer.invoke(IPC.clipboardRecheck),
  openClipboardPrivacySettings: () => ipcRenderer.invoke(IPC.clipboardOpenPrivacySettings),
  hideWindow: () => ipcRenderer.send(IPC.windowHide),
  quitApp: () => ipcRenderer.send(IPC.quit),
  onShown: (cb) => subscribe<void>(IPC.windowShown, () => cb()),
  onSettingsChanged: (cb) => subscribe<AppState>(IPC.settingsChanged, cb),
  onClipboardPrefill: (cb) => subscribe<PrefillPayload>(IPC.clipboardPrefill, cb),
};

contextBridge.exposeInMainWorld('t3bar', api);
