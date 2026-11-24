import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, SettingsPatch } from '../../shared/types';
import { api, toUiError, type UiError } from '../lib/api';

export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const counter = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++counter.current;
    const r = await api().getState();
    if (id !== counter.current) return;
    if (r.ok) { setState(r.data); setError(null); } else setError(toUiError(r));
  }, []);

  useEffect(() => {
    void refresh();
    return api().onSettingsChanged((s) => {
      counter.current++;
      setState(s);
    });
  }, [refresh]);

  const update = useCallback(async (patch: SettingsPatch): Promise<UiError | null> => {
    const r = await api().updateSettings(patch);
    if (r.ok) { counter.current++; setState(r.data); return null; }
    return toUiError(r);
  }, []);

  return { state, error, refresh, update };
}
