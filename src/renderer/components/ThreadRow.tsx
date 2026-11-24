import { ExternalLink } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { ThreadSummary } from '../../shared/types';
import { shortRelativeTime, statusTone, toneClass } from '../lib/format';

export const rowClass =
  'group flex h-[34px] w-full shrink-0 cursor-default items-center gap-[9px] rounded-lg px-2.5 text-left text-[13px] text-[#d4d4d8] outline-none';
export const rowSelectedClass =
  'bg-white/[0.08] text-[#fafafa] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.25)]';

export function ThreadRow({
  id, thread, highlighted, compact, onHover, onChoose, onOpen,
}: {
  id: string;
  thread: ThreadSummary;
  highlighted: boolean;
  compact: boolean;
  onHover(e: MouseEvent): void;
  onChoose(): void;
  onOpen(link: string): void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={highlighted}
      onMouseMove={onHover}
      onClick={onChoose}
      className={`${rowClass} ${highlighted ? rowSelectedClass : ''}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${toneClass[statusTone(thread.status)]}`} />
      <span className="min-w-0 flex-1 truncate tracking-[-0.01em]">{thread.title}</span>
      {!compact && thread.model && (
        <span className="max-w-[140px] shrink-0 truncate rounded-[5px] bg-white/[0.035] px-1.5 py-px text-[10.5px] text-[#52525b]">{thread.model}</span>
      )}
      <span className="shrink-0 text-[11px] tabular-nums text-[#52525b] group-hover:hidden">{shortRelativeTime(thread.updatedAt)}</span>
      {thread.link ? (
        <button
          type="button"
          aria-label="Open in T3 Code"
          title="Open in T3 Code"
          onClick={(e) => { e.stopPropagation(); onOpen(thread.link as string); }}
          className="hidden size-5 shrink-0 items-center justify-center rounded text-[#a1a1aa] hover:bg-white/10 hover:text-[#fafafa] group-hover:inline-flex"
        >
          <ExternalLink className="size-3.5" />
        </button>
      ) : (
        <span className="hidden w-5 group-hover:block" />
      )}
    </div>
  );
}
