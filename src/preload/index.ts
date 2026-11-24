import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { AppState, T3WidgetApi } from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  // The IpcRendererEvent is never passed to the page.
  const listener = (_event: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: T3WidgetApi = {
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
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  setPinned: (pinned) => ipcRenderer.invoke(IPC.windowSetPinned, pinned),
  hideWindow: () => ipcRenderer.send(IPC.windowHide),
  quitApp: () => ipcRenderer.send(IPC.quit),
  onShown: (cb) => subscribe<void>(IPC.windowShown, () => cb()),
  onSettingsChanged: (cb) => subscribe<AppState>(IPC.settingsChanged, cb),
};

contextBridge.exposeInMainWorld('t3widget', api);
