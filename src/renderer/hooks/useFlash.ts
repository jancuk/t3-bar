import { useCallback, useEffect, useRef, useState } from 'react';

/** A boolean that turns on for `ms` and then off again. */
export function useFlash(ms = 1400) {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const trigger = useCallback(() => {
    clear();
    setOn(true);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [clear, ms]);
  const cancel = useCallback(() => { clear(); setOn(false); }, [clear]);
  useEffect(() => clear, [clear]);
  return { on, trigger, cancel };
}
