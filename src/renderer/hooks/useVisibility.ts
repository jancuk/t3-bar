import { useEffect, useRef } from 'react';
import { api } from '../lib/api';

/** Runs `fn` every `ms` while the document is visible. Immediate refresh on show is handled by `useOnShown`. */
export function useVisibleInterval(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => ref.current(), ms);
    };
    const stop = () => {
      if (timer !== null) { clearInterval(timer); timer = null; }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') start(); else stop();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [ms, enabled]);
}

/** Calls `fn` each time the main process shows the popup. */
export function useOnShown(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => api().onShown(() => ref.current()), []);
}
