import { useEffect, useRef, type MouseEvent } from 'react';
import type { ThreadSummary } from '../../shared/types';
import type { UiError } from '../lib/api';
import { Kbd } from './Kbd';
import { ThreadRow, rowClass, rowSelectedClass } from './ThreadRow';

export const NEW_DEST = 'new';

export function DestinationList({
  targetLabel, threads, highlighted, loading, error, offline, noProjectMissing,
  compact, onHighlight, onChoose, onOpen,
}: {
  targetLabel: string;
  threads: ThreadSummary[];
  highlighted: string;
  loading: boolean;
  error: UiError | null;
  offline: boolean;
  noProjectMissing: boolean;
  compact: boolean;
  onHighlight(id: string): void;
  onChoose(): void;
  onOpen(link: string): void;
}) {
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const handlePointer = (id: string, e: MouseEvent) => {
    const prev = lastPointer.current;
    if (prev && prev.x === e.clientX && prev.y === e.clientY) return;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    onHighlight(id);
  };

  useEffect(() => {
    document.getElementById(`dest-${highlighted}`)?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  let message: string | null = null;
  if (offline) message = "T3 Code isn't running";
  else if (noProjectMissing) message = "No project isn't set up yet. Open T3 Code once.";
  else if (error) message = error.message;
  else if (!loading && threads.length === 0) message = 'No recent threads. Your first message starts one.';

  return (
    <div
      role="listbox"
      id="destination-list"
      aria-label="Destination"
      className={`flex min-h-0 flex-col gap-0.5 overflow-y-auto p-2 ${compact ? 'w-[242px] shrink-0 border-r border-white/[0.06]' : 'flex-1'}`}
    >
      <div
        id={`dest-${NEW_DEST}`}
        role="option"
        aria-selected={highlighted === NEW_DEST}
        onMouseMove={(e) => handlePointer(NEW_DEST, e)}
        onClick={onChoose}
        className={`${rowClass} ${highlighted === NEW_DEST ? rowSelectedClass : ''}`}
      >
        <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-white/[0.09] text-[13px] leading-none text-[#fafafa]">+</span>
        <span className="min-w-0 flex-1 truncate tracking-[-0.01em]">
          New thread in <span className="text-[#71717a]">{targetLabel}</span>
        </span>
        {!compact && <Kbd>⌘N</Kbd>}
      </div>

      <div className="shrink-0 px-2.5 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[#52525b]">Recent</div>
      {threads.map((t) => (
        <ThreadRow
          key={t.threadId}
          id={`dest-${t.threadId}`}
          thread={t}
          highlighted={highlighted === t.threadId}
          compact={compact}
          onHover={(e) => handlePointer(t.threadId, e)}
          onChoose={onChoose}
          onOpen={onOpen}
        />
      ))}
      {loading && threads.length === 0 && !message && <p className="px-2.5 py-2 text-xs text-[#52525b]">Loading…</p>}
      {message && <p className="px-2.5 py-2 text-xs leading-snug text-[#71717a]">{message}</p>}
    </div>
  );
}
