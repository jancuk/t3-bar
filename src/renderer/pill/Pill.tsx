import { useEffect, useState } from 'react';
import type { PillPayload } from '../../shared/types';

export function Pill({ frozen = false }: { frozen?: boolean }) {
  const [payload, setPayload] = useState<PillPayload | null>(null);

  useEffect(() => {
    const off = window.t3pill?.onShow((next) => setPayload((cur) => (cur?.id === next.id ? cur : next)));
    window.t3pill?.ready();
    return off;
  }, []);

  if (!payload) return null;
  const { id, preview, durationMs } = payload;
  const accept = () => window.t3pill?.accept(id);
  const dismiss = () => window.t3pill?.dismiss(id);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        key={id}
        role="button"
        tabIndex={0}
        title="Click to paste into T3 Bar (does not execute)"
        onClick={accept}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); accept(); } }}
        className="pill-root group relative flex h-10 max-w-[340px] cursor-pointer items-center gap-[9px] overflow-hidden rounded-full bg-[linear-gradient(180deg,rgba(28,28,34,0.9)_0%,rgba(16,16,20,0.94)_100%)] pl-2.5 pr-2 text-[#f4f4f5] shadow-[0_18px_42px_-6px_rgba(0,0,0,0.78),0_6px_16px_-4px_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(255,255,255,0.16),inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-[32px] backdrop-saturate-[180%] transition-[transform,box-shadow] duration-[140ms] outline-none hover:-translate-y-px hover:shadow-[0_22px_48px_-6px_rgba(0,0,0,0.82),0_0_0_0.5px_rgba(255,255,255,0.28),inset_0_1px_0_rgba(255,255,255,0.28)] focus-visible:ring-1 focus-visible:ring-white/50"
      >
        <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[#fafafa] text-[11px] font-extrabold tracking-[-0.03em] text-[#09090b] shadow-[0_1px_3px_rgba(0,0,0,0.4)]">T</span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="whitespace-nowrap text-[12px] font-[550] leading-[1.15] tracking-[-0.01em] text-[#fafafa]">Paste to T3 Bar</span>
          <span className="max-w-[190px] truncate font-mono text-[10.5px] leading-[1.15] text-[#71717a]">{preview}</span>
        </span>
        <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-white/10 px-[9px] text-[11px] font-medium text-[#f4f4f5] group-hover:bg-[#fafafa] group-hover:text-[#09090b]">Paste</span>
        <button
          type="button"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
          className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[13px] text-[#52525b] outline-none hover:bg-white/[0.08] hover:text-[#e4e4e7] focus-visible:ring-1 focus-visible:ring-white/50"
        >
          ×
        </button>
        <span
          aria-hidden
          onAnimationEnd={dismiss}
          style={{
            animationDuration: `${durationMs}ms`,
            ...(frozen ? { animationDelay: `-${Math.round(durationMs * 0.32)}ms`, animationPlayState: 'paused' } : {}),
          }}
          className="pill-timer absolute inset-x-4 bottom-0 h-[1.5px] rounded-full bg-[linear-gradient(90deg,rgba(255,255,255,0.45),rgba(255,255,255,0.08))]"
        />
      </div>
    </div>
  );
}
