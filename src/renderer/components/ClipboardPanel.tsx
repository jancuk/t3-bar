import type { AppState, ClipboardPosition } from '../../shared/types';

const POSITIONS: { value: ClipboardPosition; label: string }[] = [
  { value: 'top-right', label: 'Top-Right' },
  { value: 'cursor', label: 'Near Cursor' },
];

const miniBtn =
  'rounded-md border px-2 py-1 text-[11px] font-medium outline-none focus-visible:ring-1 focus-visible:ring-white/40 disabled:opacity-60';

export function ClipboardPanel({
  state, busy, onPosition, onOpenSettings, onRecheck,
}: {
  state: AppState;
  busy: boolean;
  onPosition(position: ClipboardPosition): void;
  onOpenSettings(): void;
  onRecheck(): void;
}) {
  if (state.clipboard.state === 'blocked') {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-[rgba(251,191,36,0.22)] bg-[rgba(251,191,36,0.08)] px-[9px] py-2 text-[11px] leading-[1.4] text-[#fde68a]">
        <div><strong className="font-semibold">macOS blocked clipboard access</strong></div>
        <div>Open System Settings → Privacy &amp; Security → Paste from Other Apps, allow T3 Bar, then click Re-check.</div>
        <div className="mt-0.5 flex gap-1.5">
          <button type="button" onClick={onOpenSettings} className={`${miniBtn} border-white/[0.14] bg-white/[0.08] text-[#fafafa]`}>
            Open System Settings ↗
          </button>
          <button type="button" onClick={onRecheck} disabled={busy} className={`${miniBtn} border-white/10 bg-transparent text-[#d4d4d8]`}>
            Re-check
          </button>
        </div>
      </div>
    );
  }
  const position = state.settings.clipboardPosition;
  return (
    <div className="flex flex-col gap-2 rounded-[9px] border border-white/[0.07] bg-white/[0.03] px-2.5 py-[9px]">
      <div className="flex items-center justify-between text-[11.5px] text-[#a1a1aa]">
        <span>Pop-up position</span>
        <span role="group" aria-label="Pop-up position" className="inline-flex rounded-[7px] border border-white/[0.06] bg-black/35 p-0.5">
          {POSITIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={position === p.value}
              onClick={() => onPosition(p.value)}
              className={`rounded-[5px] px-2 py-[3px] text-[11px] font-medium outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
                position === p.value ? 'bg-white/[0.12] text-[#fafafa] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'text-[#71717a]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </span>
      </div>
      {state.clipboard.state === 'watching' && (
        <div className="flex items-center gap-1.5 text-[11px] text-ok">
          <span className="size-[5px] rounded-full bg-[#34d399] shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
          <span>Permission granted · watching copies</span>
        </div>
      )}
    </div>
  );
}
