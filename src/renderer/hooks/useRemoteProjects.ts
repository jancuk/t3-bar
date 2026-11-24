import { useCallback, useEffect, useRef, useState } from 'react';
import { LOCAL_ENV_ID, type RemoteProject } from '../../shared/types';
import { api, toUiError, type UiError } from '../lib/api';
import { useOnShown, useVisibleInterval } from './useVisibility';

/** Projects on a remote machine. Always `null` for the local machine. */
export function useRemoteProjects(envId: string) {
  const remote = envId !== LOCAL_ENV_ID;
  const [result, setResult] = useState<{ envId: string; projects: RemoteProject[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const counter = useRef(0);

  const refresh = useCallback(async (force = false) => {
    const id = ++counter.current;
    if (!remote) {
      setResult(null); setError(null); setLoading(false);
      return;
    }
    setLoading(true);
    const r = await api().listRemoteProjects(envId, force ? { refresh: true } : undefined);
    if (id !== counter.current) return;
    setLoading(false);
    if (r.ok) { setResult({ envId, projects: r.data.projects }); setError(null); } else setError(toUiError(r));
  }, [envId, remote]);

  useEffect(() => {
    setError(null);
    void refresh();
  }, [refresh]);
  useVisibleInterval(() => void refresh(), 60_000, remote);
  useOnShown(() => void refresh());

  const projects = remote && result?.envId === envId ? result.projects : null;
  return { projects, loading, error, refresh: useCallback(() => refresh(true), [refresh]) };
}
