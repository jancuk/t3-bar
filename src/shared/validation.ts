const THREAD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/;
const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type Validated<T> = { ok: true; value: T } | { ok: false; message: string };

const ok = <T>(value: T): Validated<T> => ({ ok: true, value });
const bad = (message: string): Validated<never> => ({ ok: false, message });

export function validateThreadId(v: unknown): Validated<string> {
  if (typeof v !== 'string' || !THREAD_ID_RE.test(v)) return bad('Invalid thread id');
  return ok(v);
}

export function validateProjectId(v: unknown): Validated<string> {
  if (typeof v !== 'string' || !PROJECT_ID_RE.test(v)) return bad('Invalid project id');
  return ok(v);
}

function normalizeAbsolutePath(p: string): string | null {
  if (!p.startsWith('/')) return null;
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
}

/** A project target is a normalized absolute path (no NUL) or a project id. */
export function validateProjectTarget(v: unknown): Validated<string> {
  if (typeof v !== 'string' || v.length === 0 || v.length > 4096) return bad('Invalid project target');
  if (v.includes('\0')) return bad('Invalid project target');
  if (v.startsWith('/')) {
    const n = normalizeAbsolutePath(v);
    return n ? ok(n) : bad('Invalid project path');
  }
  if (PROJECT_ID_RE.test(v)) return ok(v);
  return bad('Project must be an absolute path or an id');
}

export function validateTitle(v: unknown): Validated<string | undefined> {
  if (v === undefined || v === null) return ok(undefined);
  if (typeof v !== 'string') return bad('Invalid title');
  let t = v.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/^-+\s*/, '');
  if (t.length > 200) t = t.slice(0, 200).trim();
  return ok(t.length ? t : undefined);
}

export const MAX_MESSAGE_CHARS = 100_000;

export function validateMessageText(v: unknown): Validated<string> {
  if (typeof v !== 'string') return bad('Message must be text');
  if (v.trim().length === 0) return bad('Message is empty');
  if (v.length > MAX_MESSAGE_CHARS) return bad(`Message is too long (max ${MAX_MESSAGE_CHARS} characters)`);
  if (v.includes('\0')) return bad('Message contains invalid characters');
  return ok(v);
}

export function validatePreviewCount(v: unknown): Validated<number> {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 50) return bad('Preview count must be 1 to 50');
  return ok(v);
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Loopback only, plain http. Returns the origin without a trailing slash. */
export function validateServerUrl(v: unknown): Validated<string> {
  if (typeof v !== 'string') return bad('Invalid server URL');
  let u: URL;
  try {
    u = new URL(v.trim());
  } catch {
    return bad('Invalid server URL');
  }
  if (u.protocol !== 'http:') return bad('Server URL must use http');
  if (!LOOPBACK_HOSTS.has(u.hostname)) return bad('Server URL must be 127.0.0.1, localhost or [::1]');
  if (u.username || u.password) return bad('Server URL must not contain credentials');
  return ok(u.origin);
}

export function validateExternalUrl(v: unknown): Validated<string> {
  if (typeof v !== 'string') return bad('Invalid link');
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return bad('Invalid link');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return bad('Link must be http or https');
  return ok(u.href);
}

const LOOPBACK_ORIGIN_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Plain http is only allowed for loopback and Tailscale MagicDNS names (`host.tailnet.ts.net`). */
export function isTokenSafeOrigin(origin: string): boolean {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (u.protocol === 'https:') return true;
  if (u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (LOOPBACK_ORIGIN_HOSTS.has(host)) return true;
  return host.endsWith('.ts.net') && host.split('.').filter(Boolean).length >= 4;
}

/** Origin of a remote T3 Code server that may receive a bearer token. Returns `u.origin`. */
export function validateRemoteOrigin(v: unknown): Validated<string> {
  if (typeof v !== 'string') return bad('Enter the server address');
  let u: URL;
  try {
    u = new URL(v.trim());
  } catch {
    return bad('Enter a full address such as https://my-mac.tailnet.ts.net');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return bad('Address must start with http:// or https://');
  if (u.username || u.password) return bad('Address must not contain a username or password');
  if (!isTokenSafeOrigin(u.origin)) {
    return bad('Plain http is only allowed for localhost and Tailscale (.ts.net) addresses. Use https.');
  }
  return ok(u.origin);
}

export function validateAccessToken(v: unknown): Validated<string> {
  if (typeof v !== 'string' || v.length < 8 || v.length > 4096 || !/^[\x21-\x7E]+$/.test(v)) {
    return bad('Paste the access token printed by "t3 auth session issue" (no spaces)');
  }
  return ok(v);
}

const REMOTE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/;
export function validateRemoteId(v: unknown): Validated<string> {
  if (typeof v !== 'string' || !REMOTE_ID_RE.test(v)) return bad('Invalid id');
  return ok(v);
}

export function validateEnvId(v: unknown): Validated<string> {
  if (typeof v === 'string' && (v === 'local' || /^r-[0-9a-f]{10}$/.test(v))) return ok(v);
  return bad('Invalid machine id');
}

export function validateEnvLabel(v: unknown): Validated<string | undefined> {
  if (v === undefined || v === null) return ok(undefined);
  if (typeof v !== 'string') return bad('Invalid label');
  // eslint-disable-next-line no-control-regex
  let t = v.replace(/[\u0000-\u001F\u007F\s]+/g, ' ').trim();
  if (t.length > 60) t = t.slice(0, 60).trim();
  return ok(t.length ? t : undefined);
}

/** Copy text may be whitespace-only, but must be non-empty and bounded. */
export function validateClipboardText(v: unknown): Validated<string> {
  if (typeof v !== 'string' || v.length < 1) return bad('Nothing to copy');
  if (v.length > MAX_MESSAGE_CHARS) return bad('Text is too long to copy');
  if (v.includes('\0')) return bad('Text contains invalid characters');
  return ok(v);
}
