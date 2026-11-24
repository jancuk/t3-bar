export type ErrorCode =
  | 'CLI_NOT_FOUND'
  | 'CLI_TIMEOUT'
  | 'T3_APP_MISSING'
  | 'OUTPUT_TOO_LARGE'
  | 'PROJECT_NOT_FOUND'
  | 'THREAD_NOT_FOUND'
  | 'SERVER_UNREACHABLE'
  | 'UNAUTHORIZED'
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
  kind?: 'local' | 'remote';
  envLabel?: string;
  /** Set when a remote machine is reachable but rejected the access token. */
  authError?: string;
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
export const LOCAL_ENV_ID = 'local';
export const MAX_ENVIRONMENTS = 10;

/** A saved remote machine. The access token is never part of this type. */
export interface RemoteEnvironmentSummary {
  id: string;
  label: string;
  origin: string;
  environmentId?: string;
}

export interface RemoteProject {
  id: string;
  name: string;
  path: string;
  isScratch: boolean;
}

export interface RemoteProjectList {
  envId: string;
  projects: RemoteProject[];
  fetchedAt: number;
}

export interface AddEnvironmentInput {
  origin: string;
  token: string;
  label?: string;
}

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
  environments: RemoteEnvironmentSummary[];
  /** `LOCAL_ENV_ID` or the id of a saved remote environment. */
  activeEnvironmentId: string;
  /** Last chosen project per remote environment. */
  activeTargetByEnv: Record<string, string>;
}

/** `environments` is never patchable from the renderer. `activeTargetByEnv` merges; `null` deletes a key. */
export type SettingsPatch = Partial<Omit<Settings, 'version' | 'environments' | 'activeTargetByEnv'>> & {
  activeTargetByEnv?: Record<string, string | null>;
};

export interface AppState {
  settings: Settings;
  shortcutOk: boolean;
  platform: string;
  homeDir: string;
  /** `available` is null until the scratch workspace has been probed. */
  noProject: { path: string; available: boolean | null };
  /** False when the OS keychain cannot encrypt tokens, so remotes cannot be added. */
  secretsAvailable: boolean;
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
  checkHealth(envId: string, opts?: { quick?: boolean }): Promise<Result<Health>>;
  listThreads(envId: string, targetId: string): Promise<Result<ThreadSummary[]>>;
  showThread(envId: string, targetId: string, threadId: string, count?: number): Promise<Result<ThreadDetail>>;
  sendMessage(envId: string, targetId: string, threadId: string, text: string): Promise<Result<SendResult>>;
  startThread(envId: string, targetId: string, text: string, title?: string): Promise<Result<StartResult>>;
  openThread(link: string): Promise<Result<true>>;
  /** Opens a native folder dialog in the main process. Null when cancelled. */
  addFolder(): Promise<Result<AddFolderResult>>;
  /** Opens a native folder dialog, then adds every T3 Code project found one level down. */
  scanFolder(): Promise<Result<ScanResult | null>>;
  removeProject(id: string): Promise<Result<true>>;
  openProjectInApp(envId: string, targetId: string): Promise<Result<true>>;
  listRemoteProjects(envId: string, opts?: { refresh?: boolean }): Promise<Result<RemoteProjectList>>;
  addEnvironment(input: AddEnvironmentInput): Promise<Result<RemoteEnvironmentSummary>>;
  updateEnvironmentToken(envId: string, token: string): Promise<Result<true>>;
  removeEnvironment(envId: string): Promise<Result<true>>;
  copyText(text: string): Promise<Result<true>>;
  updateSettings(patch: SettingsPatch): Promise<Result<AppState>>;
  setPinned(pinned: boolean): Promise<Result<boolean>>;
  hideWindow(): void;
  quitApp(): void;
  onShown(cb: () => void): () => void;
  onSettingsChanged(cb: (state: AppState) => void): () => void;
}
