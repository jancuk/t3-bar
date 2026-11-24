import type { Health } from '../shared/types';
import { validateServerUrl } from '../shared/validation';
import { AppError } from './errors';

export type FetchImpl = (
  url: string,
  init?: {
    method?: string;
    signal?: AbortSignal;
    headers?: Record<string, string>;
    redirect?: 'error' | 'follow' | 'manual';
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text?(): Promise<string>;
}>;

const s = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** Probes `/.well-known/t3/environment` on an already-validated origin. Never throws. */
export async function probeEnvironment(
  origin: string,
  fetchImpl: FetchImpl = fetch as unknown as FetchImpl,
  timeoutMs = 2000,
): Promise<Health> {
  const checkedAt = Date.now();
  try {
    const res = await fetchImpl(`${origin}/.well-known/t3/environment`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
      redirect: 'error',
    });
    if (!res.ok) return { reachable: false, serverUrl: origin, error: `HTTP ${res.status}`, checkedAt };
    const body = (await res.json()) as Record<string, unknown> | null;
    const platform = body && typeof body.platform === 'object' && body.platform ? (body.platform as Record<string, unknown>) : {};
    const os = s(platform.os);
    const arch = s(platform.arch);
    return {
      reachable: true,
      serverUrl: origin,
      label: s(body?.label),
      serverVersion: s(body?.serverVersion),
      environmentId: s(body?.environmentId),
      platform: os ? (arch ? `${os} ${arch}` : os) : undefined,
      checkedAt,
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    const error = name === 'TimeoutError' || name === 'AbortError' ? 'Timed out' : 'Not reachable';
    return { reachable: false, serverUrl: origin, error, checkedAt };
  }
}

export async function fetchEnvironment(serverUrl: string, fetchImpl: FetchImpl = fetch as unknown as FetchImpl): Promise<Health> {
  const v = validateServerUrl(serverUrl);
  if (!v.ok) throw new AppError('VALIDATION_ERROR', v.message);
  return probeEnvironment(v.value, fetchImpl);
}
