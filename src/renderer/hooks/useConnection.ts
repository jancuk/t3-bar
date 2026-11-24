import { useCallback, useEffect, useRef, useState } from 'react';
import type { Health } from '../../shared/types';
import { api } from '../lib/api';
import { useOnShown, useVisibleInterval } from './useVisibility';

export function useConnection(envId: string, serverUrl: string | undefined) {
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);
  const counter = useRef(0);

  const check = useCallback(async () => {
    const id = ++counter.current;
    setChecking(true);
    const r = await api().checkHealth(envId);
    if (id !== counter.current) return;
    setChecking(false);
    setHealth(r.ok ? r.data : { reachable: false, serverUrl: serverUrl ?? '', error: r.message, checkedAt: Date.now() });
  }, [envId, serverUrl]);

  // A new machine starts with an unknown status.
  useEffect(() => { counter.current++; setHealth(null); }, [envId]);
  useEffect(() => { void check(); }, [check]);
  useVisibleInterval(() => void check(), 30_000);
  useOnShown(() => void check());

  return { health, checking, check };
}
