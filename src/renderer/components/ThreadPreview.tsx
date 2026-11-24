import { ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ThreadDetail } from '../../shared/types';
import type { UiError } from '../lib/api';
import { roleLabel, statusTone, toneClass } from '../lib/format';
import { IconButton } from './IconButton';
import { Markdown } from './Markdown';

function isLongMessage(text: string): boolean {
  return text.length > 360 || text.split('\n').length > 8;
}

export function ThreadPreview({
  threadId, detail, loading, error, onRefresh, onOpen,
}: {
  threadId: string;
  detail: ThreadDetail | null;
  loading: boolean;
  error: UiError | null;
  onRefresh(): void;
  onOpen(link: string): void;
}) {
  // While the debounce settles, `detail` may still belong to the previous row.
  const current = detail && detail.thread.threadId === threadId ? detail : null;
  const endRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const count = current?.messages.length ?? 0;
  const lastLen = current?.messages[count - 1]?.text.length ?? 0;
  useEffect(() => { setExpanded({}); }, [threadId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [threadId, count, lastLen]);

  return (
    <section className="flex min-w-0 flex-1 flex-col border-l border-white/[0.06]" aria-label="Thread preview">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-neutral-400">
          {current && <span className={`size-1.5 shrink-0 rounded-full ${toneClass[statusTone(current.thread.status)]}`} />}
          <span className="truncate">{current ? current.thread.status : 'Latest messages'}</span>
          {current && current.pendingRequestCount > 0 && (
            <span className="shrink-0 rounded bg-warn/20 px-1 text-warn">{current.pendingRequestCount} pending</span>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton label="Refresh" onClick={onRefresh} className="size-6">
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </IconButton>
          {current?.thread.link && (
            <IconButton label="Open in T3 Code" onClick={() => onOpen(current.thread.link as string)} className="size-6">
              <ExternalLink className="size-3.5" />
            </IconButton>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {error && !current && <p className="rounded-md bg-danger/10 p-2 text-xs text-danger">{error.message}</p>}
        {!error && !current && <p className="text-xs text-neutral-500">{loading ? 'Loading…' : ''}</p>}
        {current && current.messages.length === 0 && <p className="text-xs text-neutral-500">No messages yet.</p>}
        {current?.messages.map((m, i) => {
          const collapsible = isLongMessage(m.text);
          const isOpen = expanded[i] === true;
          const color = m.role === 'user' ? 'text-neutral-100' : 'text-neutral-300';
          return (
            <div key={i}>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500">{roleLabel(m.role)}</div>
              <div className={collapsible && !isOpen ? 'relative max-h-[176px] overflow-hidden' : ''}>
                <Markdown text={m.text} className={color} />
                {collapsible && !isOpen && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-neutral-950/90 to-transparent" />
                )}
              </div>
              {collapsible && (
                <button
                  type="button"
                  onClick={() => setExpanded((cur) => ({ ...cur, [i]: !cur[i] }))}
                  className="mt-1 text-[11px] text-neutral-400 hover:text-neutral-200"
                >
                  {isOpen ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </section>
  );
}
