import { Folder, MessageSquareDashed } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Kbd } from './Kbd';

export function TargetPill({
  name, subtitle, scratch, ...rest
}: { name: string; subtitle?: string; scratch: boolean } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label="Choose where to send"
      {...rest}
      className="flex h-7 min-w-0 max-w-[420px] items-center gap-2 rounded-md px-2 text-[12.5px] text-neutral-100 outline-none transition-colors hover:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-accent data-[popup-open]:bg-white/[0.1]"
    >
      {scratch ? <MessageSquareDashed className="size-3.5 shrink-0 text-neutral-400" /> : <Folder className="size-3.5 shrink-0 text-neutral-400" />}
      <span className="truncate font-medium">{name}</span>
      {subtitle && <span className="truncate text-[11px] text-neutral-500">{subtitle}</span>}
      <Kbd>⌘K</Kbd>
    </button>
  );
}
