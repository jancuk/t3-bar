import { Loader2, SendHorizontal } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { MAX_MESSAGE_CHARS } from '../../shared/validation';

export function Composer({
  value, onChange, onSubmit, busy, disabled, placeholder, submitLabel, focusKey,
}: {
  value: string; onChange(v: string): void; onSubmit(): void; busy: boolean; disabled: boolean;
  placeholder: string; submitLabel: string; focusKey: unknown;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, [focusKey]);
  const empty = value.trim().length === 0;
  const tooLong = value.length > MAX_MESSAGE_CHARS;
  const canSend = !empty && !tooLong && !busy && !disabled;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 focus-within:border-accent/60">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (canSend) onSubmit();
          }
        }}
        rows={3}
        placeholder={placeholder}
        aria-label="Message"
        className="block max-h-32 w-full resize-none bg-transparent px-2.5 pt-2 text-[13px] text-neutral-100 outline-none placeholder:text-neutral-500"
      />
      <div className="flex items-center justify-between px-2 pb-1.5">
        <span className={`text-[11px] ${tooLong ? 'text-danger' : 'text-neutral-500'}`}>
          {tooLong ? 'Message is too long' : '⌘↵ to send'}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          className="flex items-center gap-1.5 rounded-md bg-accent/90 px-2.5 py-1 text-xs font-medium text-neutral-950 outline-none transition-opacity hover:bg-accent focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <SendHorizontal className="size-3.5" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
