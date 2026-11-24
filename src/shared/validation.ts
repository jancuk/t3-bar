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
