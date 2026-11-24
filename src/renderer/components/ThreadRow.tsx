import { ExternalLink } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { ThreadSummary } from '../../shared/types';
import { relativeTime, statusTone, toneClass } from '../lib/format';

export const rowClass =
  'group flex h-8 w-full cursor-default items-center gap-2.5 rounded-md px-2.5 text-left outline-none transition-colors';

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
      className={`${rowClass} ${highlighted ? 'bg-white/[0.09]' : ''}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${toneClass[statusTone(thread.status)]}`} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-100">{thread.title}</span>
      {!compact && thread.model && <span className="shrink-0 truncate text-[10.5px] text-neutral-500">{thread.model}</span>}
      <span className="shrink-0 text-[11px] text-neutral-500 group-hover:hidden">{relativeTime(thread.updatedAt)}</span>
      {thread.link ? (
        <button
          type="button"
          aria-label="Open in T3 Code"
          title="Open in T3 Code"
          onClick={(e) => { e.stopPropagation(); onOpen(thread.link as string); }}
          className="hidden size-5 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-white/10 hover:text-neutral-100 group-hover:inline-flex"
        >
          <ExternalLink className="size-3.5" />
        </button>
      ) : (
        <span className="hidden w-5 group-hover:block" />
      )}
    </div>
  );
}
