import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThreadSummary } from '../../shared/types';
import { api, toUiError, type UiError } from '../lib/api';
import { useOnShown, useVisibleInterval } from './useVisibility';

export function useThreads(envId: string, projectId: string | null) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const counter = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++counter.current;
    if (!projectId) {
      setThreads([]); setError(null); setLoading(false);
      return;
    }
    setLoading(true);
    const r = await api().listThreads(envId, projectId);
    if (id !== counter.current) return; // stale
    setLoading(false);
    if (r.ok) { setThreads(r.data); setError(null); } else setError(toUiError(r));
  }, [envId, projectId]);

  useEffect(() => {
    setThreads([]);
    void refresh();
  }, [refresh]);
  useVisibleInterval(() => void refresh(), 30_000, projectId !== null);
  useOnShown(() => void refresh());

  return { threads, loading, error, refresh };
}
