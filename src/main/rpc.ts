import { isTokenSafeOrigin } from '../shared/validation';
import { AppError } from './errors';
import type { FetchImpl } from './health';

/** The browser-style WebSocket surface this module needs (Node 22+ and Electron both provide it). */
export interface WsLike {
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}
export type WsCtor = new (url: string) => WsLike;

export const PROTOCOL_HEADER = 'x-t3-orchestration-protocol';
export const PROTOCOL_VERSION = '2';
const MAX_FRAME_CHARS = 4 * 1024 * 1024;
const TICKET_TIMEOUT_MS = 10_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function assertSafe(origin: string): void {
  if (!isTokenSafeOrigin(origin)) {
    throw new AppError('VALIDATION_ERROR', 'Refusing to send a token to an insecure address. Use https, localhost or a .ts.net address.');
  }
}

/** Exchanges the bearer token for a short-lived one-use websocket ticket. */
export async function fetchWsTicket(origin: string, token: string, fetchImpl: FetchImpl = fetch as unknown as FetchImpl): Promise<string> {
  assertSafe(origin);
  let res: Awaited<ReturnType<FetchImpl>>;
  try {
    res = await fetchImpl(`${origin}/api/auth/websocket-ticket`, {
      method: 'POST',
      signal: AbortSignal.timeout(TICKET_TIMEOUT_MS),
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
  if (!res.ok) throw new AppError('SERVER_UNREACHABLE', `That machine answered HTTP ${res.status}.`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AppError('UNKNOWN', 'Unexpected reply from the machine.');
  }
  const ticket = isObj(body) ? (body.ticket ?? body.wsTicket) : undefined;
  if (typeof ticket !== 'string' || !ticket) throw new AppError('UNKNOWN', 'Unexpected reply from the machine.');
  return ticket;
}

/** The token itself is never placed in the URL, only the one-use ticket. */
export function buildWsUrl(origin: string, ticket: string): string {
  const u = new URL(origin);
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${u.host}/ws?orchestrationProtocol=2&wsTicket=${encodeURIComponent(ticket)}`;
}

function decode(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data as Uint8Array);
  return null;
}

/** A frame may be one object, an array of objects, or newline-delimited JSON. Invalid input yields `[]`. */
export function parseFrames(data: unknown): unknown[] {
  const text = decode(data);
  if (text === null || text.length === 0 || text.length > MAX_FRAME_CHARS) return [];
  const flatten = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);
  try {
    return flatten(JSON.parse(text));
  } catch {
    const out: unknown[] = [];
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(...flatten(JSON.parse(t)));
      } catch {
        // skip malformed line
      }
    }
    return out;
  }
}

function causeMessage(cause: unknown, depth = 0): string | null {
  if (depth > 5 || cause === null || cause === undefined) return null;
  if (typeof cause === 'string') return cause;
  if (Array.isArray(cause)) {
    for (const c of cause) {
      const m = causeMessage(c, depth + 1);
      if (m) return m;
    }
    return null;
  }
  if (!isObj(cause)) return null;
  for (const key of ['message', 'error', 'defect', 'cause', 'failure', 'reason']) {
    const m = causeMessage(cause[key], depth + 1);
    if (m) return m;
  }
  return typeof cause._tag === 'string' ? cause._tag : null;
}

export interface RpcCallOptions {
  origin: string;
  token: string;
  method: string;
  payload: unknown;
  fetchImpl?: FetchImpl;
  WebSocketImpl?: WsCtor;
  timeoutMs?: number;
}

/** One request/response over the orchestration websocket. Settles exactly once and always closes the socket. */
export async function rpcCall<T = unknown>(opts: RpcCallOptions): Promise<T> {
  const { origin, token, method, payload, timeoutMs = 30_000 } = opts;
  assertSafe(origin);
  const ticket = await fetchWsTicket(origin, token, opts.fetchImpl);
  const Ctor = opts.WebSocketImpl ?? (globalThis as unknown as { WebSocket?: WsCtor }).WebSocket;
  if (!Ctor) throw new AppError('UNKNOWN', 'WebSocket is not available in this runtime.');

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let sent = false;
    let ws: WsLike | null = null;
    const closeSocket = () => {
      try {
        ws?.close();
      } catch {
        // already closed
      }
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeSocket();
      fn();
    };
    const lost = () =>
      sent
        ? new AppError('CLI_TIMEOUT', 'Connection lost before T3 Code confirmed. Check the thread before resending.')
        : new AppError('SERVER_UNREACHABLE', 'Cannot reach that machine.');
    const timer = setTimeout(() => finish(() => reject(lost())), timeoutMs);

    try {
      ws = new Ctor(buildWsUrl(origin, ticket));
    } catch {
      finish(() => reject(new AppError('SERVER_UNREACHABLE', 'Cannot reach that machine.')));
      return;
    }
    ws.onopen = () => {
      if (settled) return;
      try {
        ws?.send(JSON.stringify({ _tag: 'Request', id: '1', tag: method, payload, headers: [] }));
        sent = true;
      } catch {
        finish(() => reject(new AppError('SERVER_UNREACHABLE', 'Cannot reach that machine.')));
      }
    };
    ws.onmessage = (ev) => {
      if (settled) return;
      for (const f of parseFrames(ev.data)) {
        if (!isObj(f)) continue;
        if (f._tag === 'Ping') {
          try {
            ws?.send(JSON.stringify({ _tag: 'Pong' }));
          } catch {
            // ignore
          }
          continue;
        }
        if (f._tag !== 'Exit') continue;
        if (f.requestId !== undefined && String(f.requestId) !== '1') continue;
        const exit = isObj(f.exit) ? f.exit : null;
        if (exit?._tag === 'Success') {
          finish(() => resolve(exit.value as T));
        } else {
          const rawMsg = causeMessage(exit?.cause ?? exit) ?? 'T3 Code rejected the request.';
          const msg = rawMsg.length > 300 ? `${rawMsg.slice(0, 300)}...` : rawMsg;
          finish(() => reject(new AppError('UNKNOWN', msg)));
        }
        return;
      }
    };
    ws.onerror = () => finish(() => reject(lost()));
    ws.onclose = () => finish(() => reject(lost()));
  });
}
