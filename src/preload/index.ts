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
  listThreads: (projectId) => ipcRenderer.invoke(IPC.threadsList, projectId),
  showThread: (projectId, threadId, count) => ipcRenderer.invoke(IPC.threadsShow, projectId, threadId, count),
  sendMessage: (projectId, threadId, text) => ipcRenderer.invoke(IPC.threadsSend, projectId, threadId, text),
  startThread: (projectId, text, title) => ipcRenderer.invoke(IPC.threadsStart, projectId, text, title),
  openThread: (link) => ipcRenderer.invoke(IPC.threadsOpen, link),
  pickFolder: () => ipcRenderer.invoke(IPC.projectsPickFolder),
  addProject: (path, name) => ipcRenderer.invoke(IPC.projectsAdd, path, name),
  removeProject: (id) => ipcRenderer.invoke(IPC.projectsRemove, id),
  openProjectInApp: (projectId) => ipcRenderer.invoke(IPC.projectsOpenInApp, projectId),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  setPinned: (pinned) => ipcRenderer.invoke(IPC.windowSetPinned, pinned),
  hideWindow: () => ipcRenderer.send(IPC.windowHide),
  quitApp: () => ipcRenderer.send(IPC.quit),
  onShown: (cb) => subscribe<void>(IPC.windowShown, () => cb()),
  onSettingsChanged: (cb) => subscribe<AppState>(IPC.settingsChanged, cb),
};

contextBridge.exposeInMainWorld('t3widget', api);
