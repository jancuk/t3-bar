import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = next.current++;
    setToasts((xs) => [...xs.slice(-2), { id, kind, text }]);
    timers.current.set(id, setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3000));
  }, [dismiss]);

  useEffect(() => {
    const m = timers.current;
    return () => { m.forEach(clearTimeout); m.clear(); };
  }, []);

  return { toasts, push, dismiss };
}
