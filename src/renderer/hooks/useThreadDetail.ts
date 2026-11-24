import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThreadDetail } from '../../shared/types';
import { api, toUiError, type UiError } from '../lib/api';
import { useOnShown, useVisibleInterval } from './useVisibility';

export function useThreadDetail(projectId: string | null, threadId: string | null, count: number) {
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const counter = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++counter.current;
    if (!projectId || !threadId) {
      setDetail(null); setError(null); setLoading(false);
      return;
    }
    setLoading(true);
    const r = await api().showThread(projectId, threadId, count);
    if (id !== counter.current) return;
    setLoading(false);
    if (r.ok) { setDetail(r.data); setError(null); } else setError(toUiError(r));
  }, [projectId, threadId, count]);

  useEffect(() => {
    setDetail(null);
  }, [projectId, threadId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const isActive = detail?.thread.status === 'running' || detail?.thread.status === 'starting' || detail?.thread.status === 'queued';
  useVisibleInterval(() => void refresh(), isActive ? 6_000 : 20_000, Boolean(projectId && threadId));
  useOnShown(() => void refresh());

  return { detail, loading, error, refresh };
}
