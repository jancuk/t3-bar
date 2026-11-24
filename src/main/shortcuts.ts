import { globalShortcut } from 'electron';

export interface ShortcutStatus {
  ok: boolean;
  accelerator: string | null;
}

export interface ShortcutManager {
  register(accelerator: string): ShortcutStatus;
  unregister(): void;
  status(): ShortcutStatus;
}

export function createShortcutManager(onTrigger: () => void): ShortcutManager {
  let current: string | null = null;
  let last: ShortcutStatus = { ok: false, accelerator: null };

  const tryRegister = (acc: string): boolean => {
    try {
      return globalShortcut.register(acc, onTrigger);
    } catch {
      return false;
    }
  };

  return {
    register(accelerator) {
      const previous = current;
      if (previous) {
        globalShortcut.unregister(previous);
        current = null;
      }
      if (tryRegister(accelerator)) {
        current = accelerator;
        last = { ok: true, accelerator };
        return last;
      }
      // Keep the old shortcut working if the new one is taken or invalid.
      if (previous && previous !== accelerator && tryRegister(previous)) {
        current = previous;
        last = { ok: true, accelerator: previous };
      } else {
        last = { ok: false, accelerator };
      }
      return { ok: false, accelerator };
    },
    unregister() {
      if (current) globalShortcut.unregister(current);
      current = null;
      last = { ok: false, accelerator: null };
    },
    status: () => last,
  };
}
