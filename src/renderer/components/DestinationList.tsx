import { CornerDownLeft } from 'lucide-react';
import { useEffect, useRef, type MouseEvent } from 'react';
import type { ThreadSummary } from '../../shared/types';
import type { UiError } from '../lib/api';
import { Kbd } from './Kbd';
import { ThreadRow, rowClass } from './ThreadRow';

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
      className={`min-h-0 overflow-y-auto px-2 pb-2 transition-[width] duration-150 ${compact ? 'w-[260px] shrink-0' : 'w-full'}`}
    >
      <div
        id={`dest-${NEW_DEST}`}
        role="option"
        aria-selected={highlighted === NEW_DEST}
        onMouseMove={(e) => handlePointer(NEW_DEST, e)}
        onClick={onChoose}
        className={`${rowClass} ${highlighted === NEW_DEST ? 'bg-white/[0.09]' : ''}`}
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-[15px] leading-none text-accent">+</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-100">
          New thread in <span className="text-neutral-400">{targetLabel}</span>
        </span>
        {!compact && <Kbd>⌘N</Kbd>}
        {highlighted === NEW_DEST && compact && <CornerDownLeft className="size-3 text-neutral-500" />}
      </div>

      <div className="px-2.5 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-neutral-500">Recent</div>
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
      {loading && threads.length === 0 && !message && <p className="px-2.5 py-2 text-xs text-neutral-500">Loading…</p>}
      {message && <p className="px-2.5 py-2 text-xs leading-snug text-neutral-500">{message}</p>}
    </div>
  );
}
