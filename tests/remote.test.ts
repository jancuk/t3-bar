import { describe, expect, it, vi } from 'vitest';
import type { FetchImpl } from '../src/main/health';
import { createRemoteClient, normalizeShell, threadLink } from '../src/main/remote';
import type { WsLike } from '../src/main/rpc';

const ORIGIN = 'https://dev-mac.example.ts.net';
const ENV = { id: 'r-0123456789', label: 'Dev Mac', origin: ORIGIN, environmentId: 'env-1' };
const MODEL = { instanceId: 'codex', model: 'gpt-5' };

const shellBody = () => ({
  snapshotSequence: 1,
  projects: [
    { id: 'p1', title: 'app', workspaceRoot: '/Users/dev/app', deletedAt: null, defaultModelSelection: { instanceId: 'claude', model: 'default-model' } },
    { id: 'ps', title: 'No project', workspaceRoot: '/Users/dev/.t3/scratch', deletedAt: null },
    { id: 'p3', title: 'by path', workspaceRoot: '/home/x/.t3/scratch/', deletedAt: null },
    { id: 'pd', title: 'gone', workspaceRoot: '/x', deletedAt: '2026-01-01T00:00:00Z' },
    { id: 'pe', title: 'empty', workspaceRoot: '/Users/dev/empty', deletedAt: null },
  ],
  threads: [
    { id: 't-old', projectId: 'p1', title: 'Old', updatedAt: '2026-11-01T00:00:00Z', modelSelection: MODEL, runtimeMode: 'approval-required', status: 'ready' },
    { id: 't-new', projectId: 'p1', title: 'New', updatedAt: '2026-11-05T00:00:00Z', modelSelection: MODEL, runtimeMode: 'auto-accept-edits', status: 'ready' },
    { id: 't-run', projectId: 'p1', title: 'Busy', updatedAt: '2026-11-03T00:00:00Z', activeRunId: 'run-1', pinned: true },
    { id: 't-wait', projectId: 'p1', title: 'Waiting', updatedAt: '2026-11-02T00:00:00Z', pendingRequests: [{ id: 'x' }], status: 'ready' },
    { id: 't-dead', projectId: 'p1', title: 'Deleted', deletedAt: '2026-11-04T00:00:00Z' },
    { id: 't-other', projectId: 'pe', title: 'Elsewhere', updatedAt: '2026-11-06T00:00:00Z', modelSelection: { instanceId: 'x', model: 'other-model' }, runtimeMode: 'approval-required' },
  ],
});

type Route = (url: string, init?: Parameters<FetchImpl>[1]) => { status: number; body?: unknown; text?: string };
const mkFetch = (route: Route) => {
  const calls: { url: string; init?: Parameters<FetchImpl>[1] }[] = [];
  const impl = (async (url: string, init?: Parameters<FetchImpl>[1]) => {
    calls.push({ url, init });
    const r = route(url, init);
    const text = r.text ?? JSON.stringify(r.body ?? {});
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => JSON.parse(text), text: async () => text };
  }) as FetchImpl;
  return { impl, calls };
};

/** Answers the ticket request, then records the RPC and replies with Success (or a Failure). */
const wsEvents: { url: string; request: Record<string, unknown> }[] = [];
let wsMode: 'ok' | 'fail' | 'drop' = 'ok';
class AutoWs implements WsLike {
  onopen: WsLike['onopen'] = null;
  onmessage: WsLike['onmessage'] = null;
  onclose: WsLike['onclose'] = null;
  onerror: WsLike['onerror'] = null;
  constructor(public url: string) { queueMicrotask(() => this.onopen?.()); }
  send(d: string) {
    const request = JSON.parse(d) as Record<string, unknown>;
    if (request._tag !== 'Request') return;
    wsEvents.push({ url: this.url, request });
    queueMicrotask(() => {
      if (wsMode === 'drop') this.onclose?.();
      else if (wsMode === 'fail') this.onmessage?.({ data: JSON.stringify({ _tag: 'Exit', requestId: '1', exit: { _tag: 'Failure', cause: { message: 'Rejected by T3' } } }) });
      else this.onmessage?.({ data: JSON.stringify({ _tag: 'Exit', requestId: '1', exit: { _tag: 'Success', value: {} } }) });
    });
  }
  close() {}
}

const defaultRoute: Route = (url) => {
  if (url.endsWith('/api/orchestration/shell')) return { status: 200, body: shellBody() };
  if (url.endsWith('/api/auth/websocket-ticket')) return { status: 200, body: { ticket: 'tk' } };
  if (url.endsWith('/.well-known/t3/environment')) return { status: 200, body: { environmentId: 'env-1', label: 'Dev Mac', serverVersion: '1.0.0' } };
  return { status: 404 };
};

function setup(route: Route = defaultRoute, token: string | null = 'tok-123456', extra: Partial<Parameters<typeof createRemoteClient>[1]> = {}) {
  wsEvents.length = 0;
  wsMode = 'ok';
  const f = mkFetch(route);
  let n = 0;
  let clock = 1000;
  const client = createRemoteClient(ENV, {
    getToken: async () => token,
    fetchImpl: f.impl,
    WebSocketImpl: AutoWs,
    now: () => clock,
    uuid: () => `uuid-${++n}`,
    ...extra,
  });
  return { client, ...f, tick: (ms: number) => { clock += ms; } };
}

describe('normalizeShell', () => {
  it('drops deleted entries and flags scratch projects', () => {
    const s = normalizeShell(shellBody());
    expect(s.projects.map((p) => p.id)).toEqual(['p1', 'ps', 'p3', 'pe']);
    expect(s.projects.filter((p) => p.isScratch).map((p) => p.id)).toEqual(['ps', 'p3']);
    expect(s.threads.map((t) => t.id)).not.toContain('t-dead');
  });
  it('rejects non-objects', () => {
    expect(() => normalizeShell(null)).toThrow();
  });
});

describe('createRemoteClient reads', () => {
  it('sends bearer auth, the protocol header, and refuses redirects', async () => {
    const { client, calls } = setup();
    await client.fetchShell();
    expect(calls[0]?.url).toBe(`${ORIGIN}/api/orchestration/shell`);
    expect(calls[0]?.init).toMatchObject({
      redirect: 'error',
      headers: { authorization: 'Bearer tok-123456', 'x-t3-orchestration-protocol': '2', accept: 'application/json' },
    });
  });

  it('caches the shell for 5s, coalesces concurrent calls, and honours force', async () => {
    const { client, calls, tick } = setup();
    await Promise.all([client.fetchShell(), client.fetchShell(), client.fetchShell()]);
    expect(calls).toHaveLength(1);
    await client.fetchShell();
    expect(calls).toHaveLength(1);
    tick(5001);
    await client.fetchShell();
    expect(calls).toHaveLength(2);
    await client.fetchShell({ force: true });
    expect(calls).toHaveLength(3);
  });

  it('maps HTTP errors to codes', async () => {
    for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'UNAUTHORIZED'], [502, 'SERVER_UNREACHABLE'], [503, 'SERVER_UNREACHABLE'], [504, 'SERVER_UNREACHABLE'], [500, 'UNKNOWN']] as const) {
      const { client } = setup(() => ({ status }));
      await expect(client.fetchShell()).rejects.toMatchObject({ code });
    }
  });

  it('maps network failures and missing tokens', async () => {
    const f = mkFetch(defaultRoute);
    const down = createRemoteClient(ENV, { getToken: async () => 'tok-123456', fetchImpl: (async () => { throw new Error('ECONNREFUSED'); }) as FetchImpl });
    await expect(down.fetchShell()).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
    const { client } = setup(defaultRoute, null);
    await expect(client.fetchShell()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(f.calls).toHaveLength(0);
  });

  it('refuses to send a token to an insecure origin', async () => {
    const f = mkFetch(defaultRoute);
    const c = createRemoteClient({ ...ENV, origin: 'http://example.com' }, { getToken: async () => 'tok-123456', fetchImpl: f.impl });
    await expect(c.fetchShell()).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(f.calls).toHaveLength(0);
  });

  it('rejects oversized bodies', async () => {
    const { client } = setup(() => ({ status: 200, text: ' '.repeat(8 * 1024 * 1024 + 1) }));
    await expect(client.fetchShell()).rejects.toMatchObject({ code: 'OUTPUT_TOO_LARGE' });
  });

  it('lists projects with scratch first', async () => {
    const { client } = setup();
    const list = await client.listProjects();
    expect(list.map((p) => p.id)).toEqual(['ps', 'p3', 'p1', 'pe']);
    expect(list[0]).toEqual({ id: 'ps', name: 'No project', path: '/Users/dev/.t3/scratch', isScratch: true });
  });

  it('lists threads for a project with status mapping and links', async () => {
    const { client } = setup();
    const list = await client.listThreads('p1');
    expect(list.map((t) => t.threadId).sort()).toEqual(['t-new', 't-old', 't-run', 't-wait']);
    const by = Object.fromEntries(list.map((t) => [t.threadId, t]));
    expect(by['t-run']).toMatchObject({ status: 'running', pinned: true });
    expect(by['t-wait']?.status).toBe('waiting');
    expect(by['t-new']).toMatchObject({ status: 'ready', model: 'gpt-5', provider: 'codex', link: 'https://app.t3.codes/threads/env-1/t-new' });
    await expect(client.listThreads('nope')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('builds links with encoded segments', () => {
    expect(threadLink('env/1', 'a b')).toBe('https://app.t3.codes/threads/env%2F1/a%20b');
  });

  it('shows a thread: last N messages and pending requests', async () => {
    const detail = {
      thread: { id: 't-new', projectId: 'p1', title: 'New', status: 'ready' },
      projection: {
        messages: [1, 2, 3, 4].map((i) => ({ role: i % 2 ? 'user' : 'assistant', text: `m${i}`, createdAt: `2026-11-0${i}T00:00:00Z` })),
        runtimeRequests: [{ id: 'r1' }, { id: 'r2' }],
      },
    };
    const { client, calls } = setup((url) => (url.includes('/threads/t-new') ? { status: 200, body: detail } : defaultRoute(url)));
    const d = await client.showThread('t-new', 2);
    expect(calls[0]?.url).toBe(`${ORIGIN}/api/orchestration/threads/t-new`);
    expect(d.messages.map((m) => m.text)).toEqual(['m3', 'm4']);
    expect(d.pendingRequestCount).toBe(2);
    expect(d.thread.threadId).toBe('t-new');
  });

  it('maps a 404 thread to THREAD_NOT_FOUND', async () => {
    const { client } = setup((url) => (url.includes('/threads/') ? { status: 404 } : defaultRoute(url)));
    await expect(client.showThread('ghost', 5)).rejects.toMatchObject({ code: 'THREAD_NOT_FOUND' });
  });
});

describe('createRemoteClient writes', () => {
  it('dispatches immediately when idle', async () => {
    const { client } = setup();
    const r = await client.sendMessage('t-new', 'hello', 'p1');
    expect(r).toEqual({ threadId: 't-new', link: 'https://app.t3.codes/threads/env-1/t-new' });
    expect(wsEvents).toHaveLength(1);
    expect(wsEvents[0]?.request).toMatchObject({
      tag: 'orchestration.dispatchCommand',
      payload: { type: 'message.dispatch', threadId: 't-new', text: 'hello', attachments: [], dispatchMode: { type: 'start_immediately' } },
    });
    expect(wsEvents[0]?.url).not.toContain('tok-123456');
  });

  it('queues after an active run', async () => {
    const { client } = setup();
    await client.sendMessage('t-run', 'more');
    expect(wsEvents[0]?.request).toMatchObject({ payload: { dispatchMode: { type: 'queue_after_active' } } });
  });

  it('refuses unknown threads and project mismatches without sending', async () => {
    const { client } = setup();
    await expect(client.sendMessage('ghost', 'x')).rejects.toMatchObject({ code: 'THREAD_NOT_FOUND' });
    await expect(client.sendMessage('t-new', 'x', 'pe')).rejects.toMatchObject({ code: 'THREAD_NOT_FOUND' });
    expect(wsEvents).toHaveLength(0);
  });

  it('always refetches the shell before writing and invalidates after', async () => {
    const { client, calls } = setup();
    await client.fetchShell();
    await client.sendMessage('t-new', 'x');
    expect(calls.filter((c) => c.url.endsWith('/shell'))).toHaveLength(2);
    await client.fetchShell();
    expect(calls.filter((c) => c.url.endsWith('/shell'))).toHaveLength(3);
  });

  it('surfaces rejections and dropped connections', async () => {
    const { client } = setup();
    wsMode = 'fail';
    await expect(client.sendMessage('t-new', 'x')).rejects.toMatchObject({ code: 'UNKNOWN', message: 'Rejected by T3' });
    wsMode = 'drop';
    await expect(client.sendMessage('t-new', 'x')).rejects.toMatchObject({ code: 'CLI_TIMEOUT' });
  });

  it('starts a thread inheriting model and runtime mode from the newest thread in the project', async () => {
    const { client } = setup();
    const r = await client.startThread('p1', 'Build the thing\nmore detail');
    expect(r.threadId).toBeTruthy();
    expect(wsEvents[0]?.request).toMatchObject({
      tag: 'orchestration.launchThread',
      payload: {
        projectId: 'p1',
        title: 'Build the thing',
        generateTitle: true,
        modelSelection: MODEL,
        runtimeMode: 'auto-accept-edits',
        interactionMode: 'default',
        workspaceStrategy: { type: 'root' },
        initialMessage: { text: 'Build the thing\nmore detail', attachments: [] },
      },
    });
  });

  it('falls back to the project default model, then the newest thread anywhere, with approval-required', async () => {
    const { client } = setup();
    await client.startThread('ps', 'hi');
    expect(wsEvents[0]?.request).toMatchObject({ payload: { modelSelection: { model: 'other-model' }, runtimeMode: 'approval-required' } });
    wsEvents.length = 0;
    const body = shellBody();
    body.threads = [];
    const c2 = setup((url) => (url.endsWith('/shell') ? { status: 200, body } : defaultRoute(url))).client;
    await c2.startThread('p1', 'hi');
    expect(wsEvents[0]?.request).toMatchObject({ payload: { modelSelection: { model: 'default-model' }, runtimeMode: 'approval-required' } });
  });

  it('explains when no model is configured anywhere', async () => {
    const body = shellBody();
    body.threads = [];
    body.projects.forEach((p) => { delete (p as { defaultModelSelection?: unknown }).defaultModelSelection; });
    const { client } = setup((url) => (url.endsWith('/shell') ? { status: 200, body } : defaultRoute(url)));
    await expect(client.startThread('p1', 'hi')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Dev Mac has no model configured yet. Start one thread there in T3 Code, then try again.',
    });
    expect(wsEvents).toHaveLength(0);
  });

  it('rejects unknown projects', async () => {
    const { client } = setup();
    await expect(client.startThread('nope', 'hi')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });
});

describe('checkHealth', () => {
  it('reports a healthy remote', async () => {
    const { client } = setup();
    const h = await client.checkHealth();
    expect(h).toMatchObject({ reachable: true, kind: 'remote', envLabel: 'Dev Mac' });
    expect(h.authError).toBeUndefined();
  });
  it('flags a rejected token without failing reachability', async () => {
    const { client } = setup((url) => (url.endsWith('/shell') ? { status: 401 } : defaultRoute(url)));
    const h = await client.checkHealth();
    expect(h.reachable).toBe(true);
    expect(h.authError).toMatch(/token/i);
  });
  it('quick mode skips the authenticated call', async () => {
    const { client, calls } = setup();
    await client.checkHealth({ quick: true });
    expect(calls.map((c) => c.url)).toEqual([`${ORIGIN}/.well-known/t3/environment`]);
  });
  it('reports an unreachable machine', async () => {
    const down = createRemoteClient(ENV, { getToken: async () => 'tok-123456', fetchImpl: (async () => { throw new Error('x'); }) as FetchImpl });
    expect(await down.checkHealth()).toMatchObject({ reachable: false, kind: 'remote' });
  });
  it('surfaces other shell failures as an error', async () => {
    const { client } = setup((url) => (url.endsWith('/shell') ? { status: 503 } : defaultRoute(url)));
    const h = await client.checkHealth();
    expect(h.error).toBeTruthy();
    expect(h.authError).toBeUndefined();
  });
});

void vi;
