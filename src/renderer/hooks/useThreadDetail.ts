import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThreadDetail } from '../../shared/types';
import { api, toUiError, type UiError } from '../lib/api';
import { useOnShown, useVisibleInterval } from './useVisibility';

export function useThreadDetail(envId: string, projectId: string | null, threadIdRaw: string | null, count: number, debounceMs = 150) {
  const cache = useRef(new Map<string, ThreadDetail>());
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const counter = useRef(0);
  const [threadId, setThreadId] = useState<string | null>(threadIdRaw);

  useEffect(() => {
    setError(null);
    if (threadIdRaw === null) {
      setThreadId(null);
      setDetail(null);
      return;
    }
    const cached = cache.current.get(`${envId}:${threadIdRaw}`) ?? null;
    setDetail(cached);
    const t = setTimeout(() => setThreadId(threadIdRaw), debounceMs);
    return () => clearTimeout(t);
  }, [envId, threadIdRaw, debounceMs]);

  const refresh = useCallback(async () => {
    const id = ++counter.current;
    if (!projectId || !threadId) {
      setDetail(null); setError(null); setLoading(false);
      return;
    }
    setLoading(true);
    const r = await api().showThread(envId, projectId, threadId, count);
    if (id !== counter.current) return;
    setLoading(false);
    if (r.ok) {
      cache.current.set(`${envId}:${threadId}`, r.data);
      if (cache.current.size > 20) cache.current.delete(cache.current.keys().next().value as string);
      setDetail(r.data);
      setError(null);
    } else {
      setError(toUiError(r));
    }
  }, [envId, projectId, threadId, count]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  const isActive = detail?.thread.status === 'running' || detail?.thread.status === 'starting' || detail?.thread.status === 'queued';
  useVisibleInterval(() => void refresh(), isActive ? 6_000 : 20_000, Boolean(projectId && threadId));
  useOnShown(() => void refresh());

  const settling = threadIdRaw !== null && threadId !== threadIdRaw;
  return { detail, loading: loading || settling, error, refresh };
}
