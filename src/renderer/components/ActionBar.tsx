import { Loader2 } from 'lucide-react';
import { Kbd } from './Kbd';

const hint = 'inline-flex items-center gap-[5px]';

export type Overlay = 'palette' | 'settings' | null;

function Hints({ mode, overlay, prefillActive }: { mode: 'new' | 'thread'; overlay: Overlay; prefillActive: boolean }) {
  if (overlay === 'palette') {
    return (
      <>
        <span className={hint}><Kbd>↑↓</Kbd>Move</span>
        <span className={hint}><Kbd>↵</Kbd>Select</span>
        <span className={hint}><Kbd>Esc</Kbd>Back</span>
      </>
    );
  }
  if (overlay === 'settings') {
    return (
      <>
        <span className={hint}><Kbd>↵</Kbd>Send</span>
        <span className={hint}><Kbd>⌘K</Kbd>Folder</span>
        <span className={hint}><Kbd>Esc</Kbd>Close</span>
      </>
    );
  }
  if (prefillActive) return <span>Edit freely · press ↵ only when ready to send</span>;
  if (mode === 'thread') {
    return (
      <>
        <span className={hint}><Kbd>⌘⇧C</Kbd>Copy answer</span>
        <span className={hint}><Kbd>⌘O</Kbd>Open in T3</span>
        <span className={hint}><Kbd>Esc</Kbd>Hide</span>
      </>
    );
  }
  return (
    <>
      <span className={hint}><Kbd>↵</Kbd>Send</span>
      <span className={hint}><Kbd>⇧↵</Kbd>New line</span>
      <span className={hint}><Kbd>⌘K</Kbd>Folder</span>
      <span className={hint}><Kbd>Esc</Kbd>Hide</span>
    </>
  );
}

export function ActionBar({
  error, mode, overlay, prefillActive, busy, canSend, onSend,
}: {
  error: string | null;
  mode: 'new' | 'thread';
  overlay: Overlay;
  prefillActive: boolean;
  busy: boolean;
  canSend: boolean;
  onSend(): void;
}) {
  const label = mode === 'thread' ? 'Send reply' : 'Start thread';
  const ready = canSend && overlay === null;
  return (
    <footer className="flex h-[38px] shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] bg-black/[0.18] pl-3.5 pr-3">
      {error ? (
        <p role="alert" className="selectable min-w-0 flex-1 truncate text-[11.5px] text-danger" title={error}>{error}</p>
      ) : (
        <div className="flex min-w-0 items-center gap-3 whitespace-nowrap text-[11px] text-[#52525b]">
          <Hints mode={mode} overlay={overlay} prefillActive={prefillActive} />
        </div>
      )}
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        className={`inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-[7px] px-[11px] text-[12px] font-medium tracking-[-0.01em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/60 ${
          ready
            ? 'bg-[#fafafa] text-[#09090b] shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_18px_rgba(255,255,255,0.12)]'
            : 'border border-white/[0.06] bg-white/[0.06] text-white/[0.32]'
        }`}
      >
        {label}
        {busy ? <Loader2 className="size-3 animate-spin" /> : <span>↵</span>}
      </button>
    </footer>
  );
}
