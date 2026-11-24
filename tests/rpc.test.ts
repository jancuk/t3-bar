import { describe, expect, it, vi } from 'vitest';
import type { FetchImpl } from '../src/main/health';
import { buildWsUrl, fetchWsTicket, parseFrames, rpcCall, type WsLike } from '../src/main/rpc';

const ORIGIN = 'https://dev-mac.example.ts.net';
const TOKEN = 'secret-bearer-token';

const ticketFetch = (status = 200, body: unknown = { ticket: 'tk 1/2' }): FetchImpl =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as FetchImpl;

class FakeWs implements WsLike {
  static last: FakeWs | null = null;
  onopen: WsLike['onopen'] = null;
  onmessage: WsLike['onmessage'] = null;
  onclose: WsLike['onclose'] = null;
  onerror: WsLike['onerror'] = null;
  sent: string[] = [];
  closed = 0;
  constructor(public url: string) { FakeWs.last = this; }
  send(d: string) { this.sent.push(d); }
  close() { this.closed++; }
}

const started = async (p: Promise<unknown>): Promise<FakeWs> => {
  p.catch(() => undefined);
  await vi.waitFor(() => expect(FakeWs.last).not.toBeNull(), { interval: 1 });
  const ws = FakeWs.last as FakeWs;
  FakeWs.last = null;
  return ws;
};
const run = (extra: Partial<Parameters<typeof rpcCall>[0]> = {}) =>
  rpcCall({ origin: ORIGIN, token: TOKEN, method: 'orchestration.dispatchCommand', payload: { a: 1 }, fetchImpl: ticketFetch(), WebSocketImpl: FakeWs, ...extra });
const exit = (value: unknown) => JSON.stringify({ _tag: 'Exit', requestId: '1', exit: { _tag: 'Success', value } });

describe('buildWsUrl', () => {
  it('maps schemes and encodes the ticket, never the token', () => {
    expect(buildWsUrl('https://h.example.com', 'a b&c')).toBe('wss://h.example.com/ws?orchestrationProtocol=2&wsTicket=a%20b%26c');
    expect(buildWsUrl('http://127.0.0.1:3773', 't')).toBe('ws://127.0.0.1:3773/ws?orchestrationProtocol=2&wsTicket=t');
    expect(buildWsUrl(ORIGIN, 't')).not.toContain(TOKEN);
  });
});

describe('parseFrames', () => {
  it('handles object, array and NDJSON', () => {
    expect(parseFrames('{"a":1}')).toEqual([{ a: 1 }]);
    expect(parseFrames('[{"a":1},{"b":2}]')).toEqual([{ a: 1 }, { b: 2 }]);
    expect(parseFrames('{"a":1}\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
    expect(parseFrames('{"a":1}\nnot json\n{"b":2}')).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it('decodes binary and rejects junk or oversize', () => {
    expect(parseFrames(new TextEncoder().encode('{"a":1}'))).toEqual([{ a: 1 }]);
    expect(parseFrames(new TextEncoder().encode('{"a":1}').buffer)).toEqual([{ a: 1 }]);
    expect(parseFrames('')).toEqual([]);
    expect(parseFrames(42)).toEqual([]);
    expect(parseFrames('x'.repeat(4 * 1024 * 1024 + 1))).toEqual([]);
  });
});

describe('fetchWsTicket', () => {
  it('posts with bearer auth and refuses redirects', async () => {
    const f = ticketFetch();
    expect(await fetchWsTicket(ORIGIN, TOKEN, f)).toBe('tk 1/2');
    expect(f).toHaveBeenCalledWith(`${ORIGIN}/api/auth/websocket-ticket`, expect.objectContaining({
      method: 'POST',
      redirect: 'error',
      headers: expect.objectContaining({ authorization: `Bearer ${TOKEN}`, 'x-t3-orchestration-protocol': '2' }),
    }));
  });
  it('maps 401 and 403 to UNAUTHORIZED', async () => {
    for (const status of [401, 403]) {
      await expect(fetchWsTicket(ORIGIN, TOKEN, ticketFetch(status))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
  });
  it('maps network errors and 5xx to SERVER_UNREACHABLE', async () => {
    await expect(fetchWsTicket(ORIGIN, TOKEN, (async () => { throw new Error('boom'); }) as FetchImpl)).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
    await expect(fetchWsTicket(ORIGIN, TOKEN, ticketFetch(503))).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
  });
  it('rejects an unexpected body', async () => {
    await expect(fetchWsTicket(ORIGIN, TOKEN, ticketFetch(200, { nope: 1 }))).rejects.toMatchObject({ code: 'UNKNOWN' });
  });
});

describe('rpcCall', () => {
  it('refuses insecure origins before any I/O', async () => {
    const f = ticketFetch();
    await expect(run({ origin: 'http://example.com', fetchImpl: f })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(f).not.toHaveBeenCalled();
  });

  it('sends the request frame after open and resolves on Success', async () => {
    const p = run();
    const ws = await started(p);
    expect(ws.url).toBe('wss://dev-mac.example.ts.net/ws?orchestrationProtocol=2&wsTicket=tk%201%2F2');
    expect(ws.url).not.toContain(TOKEN);
    ws.onopen?.();
    expect(JSON.parse(ws.sent[0] as string)).toEqual({ _tag: 'Request', id: '1', tag: 'orchestration.dispatchCommand', payload: { a: 1 }, headers: [] });
    ws.onmessage?.({ data: exit({ ok: true }) });
    await expect(p).resolves.toEqual({ ok: true });
    expect(ws.closed).toBe(1);
  });

  it('answers Ping with Pong and ignores other frames', async () => {
    const p = run();
    const ws = await started(p);
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ _tag: 'Ping' }) });
    ws.onmessage?.({ data: JSON.stringify({ _tag: 'Chunk', requestId: '1' }) });
    expect(ws.sent.map((s) => JSON.parse(s)._tag)).toEqual(['Request', 'Pong']);
    ws.onmessage?.({ data: `${JSON.stringify({ _tag: 'Ping' })}\n${exit(7)}` });
    await expect(p).resolves.toBe(7);
  });

  it('rejects Failure with a readable message', async () => {
    const p = run();
    const ws = await started(p);
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ _tag: 'Exit', requestId: '1', exit: { _tag: 'Failure', cause: { _tag: 'Fail', error: { message: 'Thread is archived' } } } }) });
    await expect(p).rejects.toMatchObject({ code: 'UNKNOWN', message: 'Thread is archived' });
  });

  it('rejects a Defect', async () => {
    const p = run();
    const ws = await started(p);
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ _tag: 'Exit', requestId: '1', exit: { _tag: 'Failure', cause: [{ _tag: 'Die', defect: 'kaboom' }] } }) });
    await expect(p).rejects.toMatchObject({ code: 'UNKNOWN', message: 'kaboom' });
  });

  it('close before the request was sent is SERVER_UNREACHABLE', async () => {
    const p = run();
    const ws = await started(p);
    ws.onclose?.();
    await expect(p).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
  });

  it('close after the request was sent is CLI_TIMEOUT with a safety hint', async () => {
    const p = run();
    const ws = await started(p);
    ws.onopen?.();
    ws.onclose?.();
    await expect(p).rejects.toMatchObject({ code: 'CLI_TIMEOUT', message: expect.stringContaining('Check the thread before resending') });
  });

  it('times out and closes the socket', async () => {
    const p = run({ timeoutMs: 60 });
    const ws = await started(p);
    await expect(p).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
    expect(ws.closed).toBe(1);
    const p2 = run({ timeoutMs: 60 });
    const ws2 = await started(p2);
    ws2.onopen?.();
    await expect(p2).rejects.toMatchObject({ code: 'CLI_TIMEOUT' });
    expect(ws2.closed).toBe(1);
  });

  it('settles once even if more frames or closes arrive', async () => {
    const p = run();
    const ws = await started(p);
    ws.onopen?.();
    ws.onmessage?.({ data: exit(1) });
    ws.onmessage?.({ data: exit(2) });
    ws.onclose?.();
    await expect(p).resolves.toBe(1);
    expect(ws.closed).toBe(1);
  });

  it('propagates ticket failures', async () => {
    await expect(run({ fetchImpl: ticketFetch(401) })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
