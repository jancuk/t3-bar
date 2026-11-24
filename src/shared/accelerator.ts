const SYMBOLS: Record<string, string> = {
  control: '⌃',
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  command: '⌘',
  cmd: '⌘',
  commandorcontrol: '⌘',
  cmdorctrl: '⌘',
  super: '⌘',
  meta: '⌘',
};

const NAMED: Record<string, string> = {
  space: 'Space',
  return: '↩',
  enter: '↩',
  escape: 'Esc',
  esc: 'Esc',
  tab: '⇥',
  backspace: '⌫',
  delete: '⌦',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

/** `Control+Option+T` -> `['⌃', '⌥', 'T']`, one entry per keycap. */
export function formatAccelerator(accel: string): string[] {
  return accel
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const k = part.toLowerCase();
      return SYMBOLS[k] ?? NAMED[k] ?? (part.length === 1 ? part.toUpperCase() : part);
    });
}
