import { useCallback } from 'react';
import { api, toUiError, type UiError } from '../lib/api';

/** Copies text through the main process. Resolves to an error, or null on success. */
export function useCopy() {
  return useCallback(async (text: string): Promise<UiError | null> => {
    const r = await api().copyText(text);
    return r.ok ? null : toUiError(r);
  }, []);
}
