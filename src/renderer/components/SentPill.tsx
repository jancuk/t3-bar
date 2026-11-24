import { Check } from 'lucide-react';

export function SentPill({ show, label }: { show: boolean; label: string }) {
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none absolute inset-x-0 bottom-[50px] z-10 flex justify-center transition-opacity duration-150 ${show ? 'opacity-100' : 'opacity-0'}`}
    >
      {show && (
        <span className="glass-popover flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-[#f4f4f5]">
          <Check className="size-3.5 text-ok" />{label}
        </span>
      )}
    </div>
  );
}
