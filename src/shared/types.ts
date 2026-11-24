export type ErrorCode =
  | 'CLI_NOT_FOUND'
  | 'CLI_TIMEOUT'
  | 'T3_APP_MISSING'
  | 'OUTPUT_TOO_LARGE'
  | 'PROJECT_NOT_FOUND'
  | 'THREAD_NOT_FOUND'
  | 'SERVER_UNREACHABLE'
  | 'CLI_ERROR'
  | 'VALIDATION_ERROR'
  | 'IN_FLIGHT'
  | 'UNKNOWN';

export type Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };

export interface Health {
  reachable: boolean;
  serverUrl: string;
  label?: string;
  serverVersion?: string;
  platform?: string;
  environmentId?: string;
  error?: string;
  checkedAt: number;
}

export interface ThreadSummary {
  threadId: string;
  title: string;
  status: string;
  model?: string;
  provider?: string;
  link?: string;
  updatedAt?: string;
  createdAt?: string;
  pinned: boolean;
  settled: boolean;
  archived: boolean;
}

export interface ThreadMessage {
  role: string;
  text: string;
  createdAt?: string;
}

export interface ThreadDetail {
  thread: ThreadSummary;
  messages: ThreadMessage[];
  pendingRequestCount: number;
}

export interface SendResult {
  threadId?: string;
  link?: string;
}

export interface StartResult {
  threadId?: string;
  link?: string;
}

export interface SavedProject {
  id: string;
  name: string;
  path: string;
}

export const NO_PROJECT_ID = 'no-project';

export interface Settings {
  version: 1;
  cliPath: string;
  serverUrl: string;
  projects: SavedProject[];
  /** `NO_PROJECT_ID` or the id of a saved project. */
  activeProjectId: string;
  pinned: boolean;
  previewCount: number;
  shortcut: string;
  showSettled: boolean;
  autoHideOnSend: boolean;
}

export type SettingsPatch = Partial<Omit<Settings, 'version'>>;

export interface AppState {
  settings: Settings;
  shortcutOk: boolean;
  platform: string;
  homeDir: string;
  /** `available` is null until the scratch workspace has been probed. */
  noProject: { path: string; available: boolean | null };
}

export interface ScanResult {
  parent: string;
  scanned: number;
  truncated: boolean;
  added: SavedProject[];
  alreadySaved: number;
  notProjects: number;
  failed: number;
}

export type AddFolderResult = SavedProject | null;

export interface T3WidgetApi {
  getState(): Promise<Result<AppState>>;
  checkHealth(): Promise<Result<Health>>;
  listThreads(targetId: string): Promise<Result<ThreadSummary[]>>;
  showThread(targetId: string, threadId: string, count: number): Promise<Result<ThreadDetail>>;
  sendMessage(targetId: string, threadId: string, text: string): Promise<Result<SendResult>>;
  startThread(targetId: string, text: string, title?: string): Promise<Result<StartResult>>;
  openThread(link: string): Promise<Result<true>>;
  /** Opens a native folder dialog in the main process. Null when cancelled. */
  addFolder(): Promise<Result<AddFolderResult>>;
  /** Opens a native folder dialog, then adds every T3 Code project found one level down. */
  scanFolder(): Promise<Result<ScanResult | null>>;
  removeProject(id: string): Promise<Result<true>>;
  openProjectInApp(targetId: string): Promise<Result<true>>;
  updateSettings(patch: SettingsPatch): Promise<Result<AppState>>;
  setPinned(pinned: boolean): Promise<Result<boolean>>;
  hideWindow(): void;
  quitApp(): void;
  onShown(cb: () => void): () => void;
  onSettingsChanged(cb: (state: AppState) => void): () => void;
}
