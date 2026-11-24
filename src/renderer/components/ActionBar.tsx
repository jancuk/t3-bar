import { CornerDownLeft, Loader2 } from 'lucide-react';
import { Kbd } from './Kbd';

const hint = 'flex items-center gap-1 text-[11px] text-neutral-500';

export function ActionBar({
  error, label, busy, canSend, onSend,
}: { error: string | null; label: string; busy: boolean; canSend: boolean; onSend(): void }) {
  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-3">
      {error ? (
        <p role="alert" className="selectable min-w-0 flex-1 truncate text-[11.5px] text-danger" title={error}>{error}</p>
      ) : (
        <div className="flex min-w-0 items-center gap-3">
          <span className={hint}><Kbd>↵</Kbd>Send</span>
          <span className={hint}><Kbd>⇧↵</Kbd>New line</span>
          <span className={hint}><Kbd>⌘K</Kbd>Folder</span>
          <span className={hint}><Kbd>Esc</Kbd>Close</span>
        </div>
      )}
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        className="flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-accent/90 px-2.5 text-[11.5px] font-medium text-neutral-950 outline-none transition-opacity hover:bg-accent focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-35"
      >
        {label}
        {busy ? <Loader2 className="size-3 animate-spin" /> : <CornerDownLeft className="size-3" />}
      </button>
    </footer>
  );
}
