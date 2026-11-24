import { Folder, MessageSquareDashed } from 'lucide-react';
import type { ComponentProps } from 'react';

export function TargetPill({
  name, subtitle, scratch, ...rest
}: { name: string; subtitle?: string; scratch: boolean } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label="Choose where to send"
      {...rest}
      className="inline-flex h-[26px] min-w-0 max-w-[420px] items-center gap-1.5 rounded-[7px] border border-white/[0.08] bg-white/[0.055] pl-2 pr-[9px] text-[12px] text-[#e4e4e7] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] outline-none transition-[background] duration-[120ms] hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-white/40 data-[popup-open]:bg-white/10"
    >
      {scratch ? <MessageSquareDashed className="size-[13px] shrink-0" strokeWidth={1.8} /> : <Folder className="size-[13px] shrink-0" strokeWidth={1.8} />}
      <span className="truncate font-medium tracking-[-0.01em]">{name}</span>
      {subtitle && <span className="truncate text-[11px] text-[#71717a]">{subtitle}</span>}
      <span className="ml-0.5 shrink-0 font-mono text-[10px] text-[#71717a]">⌘K</span>
    </button>
  );
}
