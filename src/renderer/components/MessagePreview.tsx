import { ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ThreadDetail } from '../../shared/types';
import type { UiError } from '../lib/api';
import { roleLabel, statusTone, toneClass } from '../lib/format';
import { IconButton } from './IconButton';

export function MessagePreview({
  detail, loading, error, onRefresh, onOpen,
}: { detail: ThreadDetail | null; loading: boolean; error: UiError | null; onRefresh(): void; onOpen(link: string): void }) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = detail?.messages.length ?? 0;
  const lastText = detail?.messages[count - 1]?.text.length ?? 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [detail?.thread.threadId, count, lastText]);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-white/10 bg-black/20">
      <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-neutral-400">
          {detail && <span className={`size-1.5 shrink-0 rounded-full ${toneClass[statusTone(detail.thread.status)]}`} />}
          <span className="truncate">{detail ? `${detail.thread.status}${detail.thread.model ? ` · ${detail.thread.model}` : ''}` : 'Recent messages'}</span>
          {detail && detail.pendingRequestCount > 0 && (
            <span className="shrink-0 rounded bg-warn/20 px-1 text-warn">{detail.pendingRequestCount} pending</span>
          )}
        </div>
        <div className="flex items-center">
          <IconButton label="Refresh" onClick={onRefresh} className="size-6">
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </IconButton>
          {detail?.thread.link && (
            <IconButton label="Open in T3 Code" onClick={() => onOpen(detail.thread.link as string)} className="size-6">
              <ExternalLink className="size-3.5" />
            </IconButton>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {error && <p className="rounded-md bg-danger/10 p-2 text-xs text-danger">{error.message}</p>}
        {!error && !detail && <p className="p-2 text-xs text-neutral-500">{loading ? 'Loading…' : 'Select a thread to see its latest messages.'}</p>}
        {detail && detail.messages.length === 0 && <p className="p-2 text-xs text-neutral-500">No messages yet.</p>}
        {detail?.messages.map((m, i) => (
          <div key={i} className={`rounded-lg px-2.5 py-1.5 ${m.role === 'user' ? 'bg-accent/15' : 'bg-white/5'}`}>
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">{roleLabel(m.role)}</div>
            <p className="selectable line-clamp-6 whitespace-pre-wrap break-words text-[12.5px] leading-snug text-neutral-200">{m.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
