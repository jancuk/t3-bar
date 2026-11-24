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
  checkHealth: (envId, opts) => ipcRenderer.invoke(IPC.healthCheck, envId, opts),
  listThreads: (envId, targetId) => ipcRenderer.invoke(IPC.threadsList, envId, targetId),
  showThread: (envId, targetId, threadId, count) => ipcRenderer.invoke(IPC.threadsShow, envId, targetId, threadId, count),
  sendMessage: (envId, targetId, threadId, text) => ipcRenderer.invoke(IPC.threadsSend, envId, targetId, threadId, text),
  startThread: (envId, targetId, text, title) => ipcRenderer.invoke(IPC.threadsStart, envId, targetId, text, title),
  openThread: (link) => ipcRenderer.invoke(IPC.threadsOpen, link),
  addFolder: () => ipcRenderer.invoke(IPC.projectsAddFolder),
  scanFolder: () => ipcRenderer.invoke(IPC.projectsScan),
  removeProject: (id) => ipcRenderer.invoke(IPC.projectsRemove, id),
  openProjectInApp: (envId, targetId) => ipcRenderer.invoke(IPC.projectsOpenInApp, envId, targetId),
  listRemoteProjects: (envId, opts) => ipcRenderer.invoke(IPC.envProjects, envId, opts),
  addEnvironment: (input) => ipcRenderer.invoke(IPC.envAdd, input),
  updateEnvironmentToken: (envId, token) => ipcRenderer.invoke(IPC.envUpdateToken, envId, token),
  removeEnvironment: (envId) => ipcRenderer.invoke(IPC.envRemove, envId),
  copyText: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  setPinned: (pinned) => ipcRenderer.invoke(IPC.windowSetPinned, pinned),
  hideWindow: () => ipcRenderer.send(IPC.windowHide),
  quitApp: () => ipcRenderer.send(IPC.quit),
  onShown: (cb) => subscribe<void>(IPC.windowShown, () => cb()),
  onSettingsChanged: (cb) => subscribe<AppState>(IPC.settingsChanged, cb),
};

contextBridge.exposeInMainWorld('t3widget', api);
