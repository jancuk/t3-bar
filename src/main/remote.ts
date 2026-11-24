import type {
  Health,
  RemoteEnvironmentSummary,
  RemoteProject,
  SendResult,
  StartResult,
  ThreadDetail,
  ThreadMessage,
  ThreadSummary,
} from '../shared/types';
import { isTokenSafeOrigin } from '../shared/validation';
import { AppError } from './errors';
import { probeEnvironment, type FetchImpl } from './health';
import { PROTOCOL_HEADER, PROTOCOL_VERSION, rpcCall, type WsCtor } from './rpc';

const MAX_BODY_CHARS = 8 * 1024 * 1024;
const HTTP_TIMEOUT_MS = 10_000;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

export interface ShellProject {
  id: string;
  name: string;
  path: string;
  isScratch: boolean;
  defaultModelSelection?: Record<string, unknown>;
}

export interface ShellThread {
  id: string;
  projectId: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  modelSelection?: Record<string, unknown>;
  runtimeMode?: string;
  activeRunId?: string;
  status?: string;
  pendingCount: number;
  pinned: boolean;
  settled: boolean;
  archived: boolean;
}

export interface Shell {
  projects: ShellProject[];
  threads: ShellThread[];
}

export function threadLink(environmentId: string, threadId: string): string {
  return `https://app.t3.codes/threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(threadId)}`;
}

export function normalizeShell(raw: unknown): Shell {
  if (!isObj(raw)) throw new AppError('UNKNOWN', 'Unexpected reply from the machine.');
  const projects: ShellProject[] = [];
  for (const p of Array.isArray(raw.projects) ? raw.projects : []) {
    if (!isObj(p) || p.deletedAt != null) continue;
    const id = str(p.id);
    if (!id) continue;
    const root = str(p.workspaceRoot) ?? '';
    const title = str(p.title) ?? (root.split('/').filter(Boolean).pop() || id);
    projects.push({
      id,
      name: title,
      path: root,
      isScratch: title === 'No project' || /\/\.t3\/scratch\/?$/.test(root),
      defaultModelSelection: isObj(p.defaultModelSelection) ? p.defaultModelSelection : undefined,
    });
  }
  const threads: ShellThread[] = [];
  for (const t of Array.isArray(raw.threads) ? raw.threads : []) {
    if (!isObj(t) || t.deletedAt != null) continue;
    const id = str(t.id) ?? str(t.threadId);
    const projectId = str(t.projectId);
    if (!id || !projectId) continue;
    const session = isObj(t.session) ? t.session : null;
    const pending = Array.isArray(t.pendingRequests) ? t.pendingRequests.length : 0;
    threads.push({
      id,
      projectId,
      title: str(t.title) ?? 'Untitled thread',
      createdAt: str(t.createdAt),
      updatedAt: str(t.updatedAt),
      modelSelection: isObj(t.modelSelection) ? t.modelSelection : undefined,
      runtimeMode: str(t.runtimeMode),
      activeRunId: str(t.activeRunId) ?? str(session?.activeRunId),
      status: str(t.status) ?? str(session?.status),
      pendingCount: pending,
      pinned: t.pinned === true || t.pinnedAt != null,
      settled: t.settled === true || t.settledAt != null,
      archived: t.archived === true || t.archivedAt != null,
    });
  }
  return { projects, threads };
}

const RUNNING = new Set(['running', 'starting', 'queued']);

function isActive(t: ShellThread): boolean {
  return Boolean(t.activeRunId) || (t.status !== undefined && RUNNING.has(t.status));
}

function summarize(t: ShellThread, environmentId: string | undefined): ThreadSummary {
  const status = isActive(t) ? 'running' : t.pendingCount > 0 ? 'waiting' : (t.status ?? 'idle');
  const ms = t.modelSelection;
  return {
    threadId: t.id,
    title: t.title,
    status,
    model: str(ms?.model),
    provider: str(ms?.instanceId) ?? str(ms?.provider),
    link: environmentId ? threadLink(environmentId, t.id) : undefined,
    updatedAt: t.updatedAt,
    createdAt: t.createdAt,
    pinned: t.pinned,
    settled: t.settled,
    archived: t.archived,
  };
}

function newest<T extends { updatedAt?: string; createdAt?: string }>(items: T[]): T | undefined {
  return [...items].sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''))[0];
}

export interface RemoteDeps {
  getToken(): Promise<string | null>;
  fetchImpl?: FetchImpl;
  WebSocketImpl?: WsCtor;
  now?: () => number;
  uuid?: () => string;
  shellTtlMs?: number;
}

export interface RemoteClient {
  readonly env: RemoteEnvironmentSummary;
  fetchShell(opts?: { force?: boolean }): Promise<Shell>;
  listProjects(opts?: { force?: boolean }): Promise<RemoteProject[]>;
  listThreads(projectId: string): Promise<ThreadSummary[]>;
  showThread(threadId: string, count: number): Promise<ThreadDetail>;
  sendMessage(threadId: string, text: string, expectedProjectId?: string): Promise<SendResult>;
  startThread(projectId: string, text: string, title?: string): Promise<StartResult>;
  checkHealth(opts?: { quick?: boolean }): Promise<Health>;
  invalidate(): void;
}

export function createRemoteClient(env: RemoteEnvironmentSummary, deps: RemoteDeps): RemoteClient {
  const fetchImpl = deps.fetchImpl ?? (fetch as unknown as FetchImpl);
  const now = deps.now ?? Date.now;
  const uuid = deps.uuid ?? (() => globalThis.crypto.randomUUID());
  const ttl = deps.shellTtlMs ?? 5000;
  let environmentId = env.environmentId;
  let cache: { at: number; shell: Shell } | null = null;
  let inflight: Promise<Shell> | null = null;
  let cacheGen = 0;

  const getJson = async (path: string, notFound?: AppError): Promise<unknown> => {
    if (!isTokenSafeOrigin(env.origin)) {
      throw new AppError('VALIDATION_ERROR', 'Refusing to send a token to an insecure address.');
    }
    const token = await deps.getToken();
    if (!token) throw new AppError('UNAUTHORIZED', 'No access token saved for this machine.');
    let res: Awaited<ReturnType<FetchImpl>>;
    try {
      res = await fetchImpl(`${env.origin}${path}`, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        headers: {
          authorization: `Bearer ${token}`,
          [PROTOCOL_HEADER]: PROTOCOL_VERSION,
          accept: 'application/json',
        },
        redirect: 'error',
      });
    } catch {
      throw new AppError('SERVER_UNREACHABLE', 'Cannot reach that machine.');
    }
    if (res.status === 401 || res.status === 403) {
      throw new AppError('UNAUTHORIZED', 'That machine rejected the access token.');
    }
    if (res.status === 404 && notFound) throw notFound;
    if ([502, 503, 504].includes(res.status)) throw new AppError('SERVER_UNREACHABLE', 'Cannot reach that machine.');
    if (!res.ok) throw new AppError('UNKNOWN', `That machine answered HTTP ${res.status}.`);
    try {
      if (typeof res.text === 'function') {
        const text = await res.text();
        if (text.length > MAX_BODY_CHARS) throw new AppError('OUTPUT_TOO_LARGE', 'Reply from the machine is too large.');
        return JSON.parse(text) as unknown;
      }
      return await res.json();
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('UNKNOWN', 'Unexpected reply from the machine.');
    }
  };

  const fetchShell = async (opts: { force?: boolean } = {}): Promise<Shell> => {
    if (!opts.force && cache && now() - cache.at < ttl) return cache.shell;
    if (!opts.force && inflight) return inflight;
    const gen = cacheGen;
    const p = getJson('/api/orchestration/shell')
      .then((raw) => {
        const shell = normalizeShell(raw);
        if (gen === cacheGen) cache = { at: now(), shell };
        return shell;
      })
      .finally(() => {
        if (inflight === p) inflight = null;
      });
    inflight = p;
    return p;
  };

  const requireProject = (shell: Shell, projectId: string): ShellProject => {
    const p = shell.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('PROJECT_NOT_FOUND', `That project is no longer on ${env.label}.`);
    return p;
  };

  const rpc = <T>(method: string, payload: unknown): Promise<T> =>
    deps.getToken().then((token) => {
      if (!token) throw new AppError('UNAUTHORIZED', 'No access token saved for this machine.');
      return rpcCall<T>({
        origin: env.origin,
        token,
        method,
        payload,
        fetchImpl,
        WebSocketImpl: deps.WebSocketImpl,
      });
    });

  const client: RemoteClient = {
    env,
    fetchShell,

    async listProjects(opts) {
      const shell = await fetchShell(opts);
      const list: RemoteProject[] = shell.projects.map((p) => ({ id: p.id, name: p.name, path: p.path, isScratch: p.isScratch }));
      return [...list.filter((p) => p.isScratch), ...list.filter((p) => !p.isScratch)];
    },

    async listThreads(projectId) {
      const shell = await fetchShell();
      requireProject(shell, projectId);
      return shell.threads.filter((t) => t.projectId === projectId).map((t) => summarize(t, environmentId));
    },

    async showThread(threadId, count) {
      const raw = await getJson(
        `/api/orchestration/threads/${encodeURIComponent(threadId)}`,
        new AppError('THREAD_NOT_FOUND', 'That thread is no longer available.'),
      );
      if (!isObj(raw)) throw new AppError('UNKNOWN', 'Unexpected reply from the machine.');
      const projection = isObj(raw.projection) ? raw.projection : raw;
      const threadRaw = isObj(raw.thread) ? raw.thread : isObj(projection.thread) ? projection.thread : raw;
      const shell = normalizeShell({ projects: [], threads: [{ ...threadRaw, id: threadRaw.id ?? threadId, projectId: threadRaw.projectId ?? 'x' }] });
      const t = shell.threads[0];
      if (!t) throw new AppError('THREAD_NOT_FOUND', 'That thread is no longer available.');
      const msgsRaw = Array.isArray(projection.messages) ? projection.messages : Array.isArray(raw.messages) ? raw.messages : [];
      const messages: ThreadMessage[] = [];
      for (const m of msgsRaw) {
        if (!isObj(m)) continue;
        const text = typeof m.text === 'string' ? m.text : typeof m.content === 'string' ? m.content : null;
        if (text === null) continue;
        messages.push({ role: str(m.role) ?? 'unknown', text, createdAt: str(m.createdAt) });
      }
      const n = Math.max(0, Math.floor(count));
      const requests = Array.isArray(projection.runtimeRequests) ? projection.runtimeRequests.length : t.pendingCount;
      return {
        thread: summarize({ ...t, pendingCount: requests }, environmentId),
        messages: n > 0 ? messages.slice(-n) : [],
        pendingRequestCount: requests,
      };
    },

    async sendMessage(threadId, text, expectedProjectId) {
      try {
        const shell = await fetchShell({ force: true });
        const t = shell.threads.find((x) => x.id === threadId);
        if (!t || (expectedProjectId !== undefined && t.projectId !== expectedProjectId)) {
          throw new AppError('THREAD_NOT_FOUND', 'That thread is no longer available.');
        }
        const dispatchMode = isActive(t) ? { type: 'queue_after_active' } : { type: 'start_immediately' };
        await rpc('orchestration.dispatchCommand', {
          type: 'message.dispatch',
          commandId: uuid(),
          threadId,
          messageId: uuid(),
          text,
          attachments: [],
          dispatchMode,
        });
        return { threadId, link: environmentId ? threadLink(environmentId, threadId) : undefined };
      } finally {
        client.invalidate();
      }
    },

    async startThread(projectId, text, title) {
      try {
        const shell = await fetchShell({ force: true });
        const project = requireProject(shell, projectId);
        const inProject = shell.threads.filter((t) => t.projectId === projectId);
        // Model and runtime mode come from the same thread: newest in the project, else the project default, else newest anywhere.
        let source = newest(inProject.filter((t) => t.modelSelection));
        if (!source && !project.defaultModelSelection) source = newest(shell.threads.filter((t) => t.modelSelection));
        const modelSelection = source?.modelSelection ?? project.defaultModelSelection;
        if (!modelSelection) {
          throw new AppError('VALIDATION_ERROR', `${env.label} has no model configured yet. Start one thread there in T3 Code, then try again.`);
        }
        const runtimeMode = source?.runtimeMode ?? 'approval-required';
        const threadId = uuid();
        const firstLine = text.trim().split('\n')[0] ?? '';
        const finalTitle = title ?? (firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine || 'New thread');
        await rpc('orchestration.launchThread', {
          commandId: uuid(),
          threadId,
          projectId,
          title: finalTitle,
          generateTitle: true,
          modelSelection,
          runtimeMode,
          interactionMode: 'default',
          workspaceStrategy: { type: 'root' },
          initialMessage: { messageId: uuid(), text, attachments: [] },
        });
        return { threadId, link: environmentId ? threadLink(environmentId, threadId) : undefined };
      } finally {
        client.invalidate();
      }
    },

    async checkHealth(opts = {}) {
      const base = await probeEnvironment(env.origin, fetchImpl);
      if (base.environmentId) environmentId = base.environmentId;
      const h: Health = { ...base, kind: 'remote', envLabel: env.label };
      if (!h.reachable || opts.quick) return h;
      try {
        await fetchShell();
      } catch (e) {
        if (e instanceof AppError && e.code === 'UNAUTHORIZED') {
          h.authError = 'Access token was rejected. Update it from the machine menu.';
        } else {
          h.error = e instanceof Error ? e.message : 'Could not read the machine.';
        }
      }
      return h;
    },

    invalidate() {
      cacheGen++;
      cache = null;
    },
  };
  return client;
}
