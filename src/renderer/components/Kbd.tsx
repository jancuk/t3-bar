import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-white/10 bg-white/[0.06] px-1 font-sans text-[10.5px] leading-none text-neutral-400">
      {children}
    </kbd>
  );
}
