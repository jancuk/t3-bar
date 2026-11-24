import { Check } from 'lucide-react';

export function SentPill({ show }: { show: boolean }) {
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none absolute inset-x-0 bottom-12 flex justify-center transition-opacity duration-150 ${show ? 'opacity-100' : 'opacity-0'}`}
    >
      {show && (
        <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-neutral-800/90 px-3 py-1 text-xs text-neutral-100 shadow-lg">
          <Check className="size-3.5 text-ok" />Sent to T3 Code
        </span>
      )}
    </div>
  );
}
