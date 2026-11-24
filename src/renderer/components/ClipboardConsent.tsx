import { Clipboard } from 'lucide-react';

const GUARDS = [
  'Stays local in memory. Never saved or sent until you press Enter',
  'Skips copies from apps that mark them as concealed (many password managers do)',
  'Stops watching immediately when switched off',
];

export function ClipboardConsent({
  busy, error, onCancel, onAllow,
}: { busy: boolean; error: string | null; onCancel(): void; onAllow(): void }) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-[9px] border border-white/10 bg-white/[0.07] text-[#fafafa]">
          <Clipboard className="size-[15px]" strokeWidth={1.9} />
        </span>
        <div>
          <div className="text-[13.5px] font-semibold tracking-[-0.015em] text-[#fafafa]">Allow clipboard quick-capture?</div>
          <div className="mt-px text-[11px] leading-[1.3] text-[#71717a]">Optional · turn off anytime</div>
        </div>
      </div>
      <p className="text-[11.5px] leading-[1.48] text-[#a1a1aa]">
        When you copy text in another app, T3 Bar shows a quiet pill so you can paste it into the composer without executing it.
      </p>
      <div className="flex flex-col gap-1.5 rounded-[9px] border border-white/[0.06] bg-white/[0.03] px-2.5 py-[9px]">
        {GUARDS.map((g) => (
          <div key={g} className="flex items-start gap-[7px] text-[11px] leading-[1.35] text-[#d4d4d8]">
            <span className="shrink-0 font-bold text-ok">✓</span>
            <span>{g}</span>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="selectable text-[11px] text-danger">{error}</p>}
      <div className="mt-0.5 flex justify-end gap-[7px]">
        <button
          type="button"
          onClick={onCancel}
          className="h-7 rounded-[7px] border border-white/10 bg-transparent px-[11px] text-[12px] font-medium text-[#a1a1aa] outline-none hover:bg-white/5 hover:text-[#fafafa] focus-visible:ring-1 focus-visible:ring-white/40"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onAllow}
          disabled={busy}
          className="h-7 rounded-[7px] bg-[#fafafa] px-3 text-[12px] font-semibold text-[#09090b] shadow-[0_1px_3px_rgba(0,0,0,0.4)] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
        >
          Allow &amp; Enable
        </button>
      </div>
    </>
  );
}
