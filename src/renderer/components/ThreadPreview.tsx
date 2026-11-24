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
  threadId, detail, loading, error, onRefresh, onOpen, onCopy,
}: {
  threadId: string;
  detail: ThreadDetail | null;
  loading: boolean;
  error: UiError | null;
  onRefresh(): void;
  onOpen(link: string): void;
  /** Resolves true when the text was copied. */
  onCopy(text: string): Promise<boolean>;
}) {
  // While the debounce settles, `detail` may still belong to the previous row.
  const current = detail && detail.thread.threadId === threadId ? detail : null;
  const endRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);
  const copy = async (i: number, text: string) => {
    if (!(await onCopy(text)) || !mounted.current) return;
    setCopied(i);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => { if (mounted.current) setCopied(null); }, 1500);
  };
  const count = current?.messages.length ?? 0;
  const lastLen = current?.messages[count - 1]?.text.length ?? 0;
  useEffect(() => { setExpanded({}); setCopied(null); }, [threadId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [threadId, count, lastLen]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-black/[0.16]" aria-label="Thread preview">
      <div className="flex h-[34px] shrink-0 items-center justify-between gap-2 border-b border-white/[0.045] px-3.5">
        <div className="flex min-w-0 items-center gap-[7px] text-[11px] text-[#71717a]">
          {current && <span className={`size-1.5 shrink-0 rounded-full ${toneClass[statusTone(current.thread.status)]}`} />}
          <span className="truncate">{current ? current.thread.status : 'Latest messages'}</span>
          {current && current.pendingRequestCount > 0 && (
            <span className="shrink-0 rounded bg-warn/20 px-1 text-warn">{current.pendingRequestCount} pending</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Refresh" onClick={onRefresh} className="size-[22px]!">
            <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
          </IconButton>
          {current?.thread.link && (
            <IconButton label="Open in T3 Code" onClick={() => onOpen(current.thread.link as string)} className="size-[22px]!">
              <ExternalLink className="size-3" strokeWidth={2} />
            </IconButton>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {error && !current && <p className="rounded-md bg-danger/10 p-2 text-xs text-danger">{error.message}</p>}
        {!error && !current && <p className="text-xs text-[#52525b]">{loading ? 'Loading…' : ''}</p>}
        {current && current.messages.length === 0 && <p className="text-xs text-[#52525b]">No messages yet.</p>}
        {current?.messages.map((m, i) => {
          const collapsible = isLongMessage(m.text);
          const isOpen = expanded[i] === true;
          const color = m.role === 'user' ? 'text-[#fafafa] !leading-[1.45]' : 'text-[#d4d4d8]';
          return (
            <div key={i} className="group shrink-0">
              <div className="mb-1 flex h-[18px] items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#52525b]">{roleLabel(m.role)}</span>
                <button
                  type="button"
                  aria-label={copied === i ? 'Copied' : `Copy ${roleLabel(m.role).toLowerCase()} message`}
                  title="Copy message"
                  onClick={() => void copy(i, m.text)}
                  className={`inline-flex items-center gap-1 rounded-[5px] border px-[7px] py-0.5 text-[10.5px] outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-white/40 ${
                    copied === i
                      ? 'border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.08)] text-ok opacity-100'
                      : 'border-white/[0.07] bg-white/[0.06] text-[#a1a1aa] opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {copied === i ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className={collapsible && !isOpen ? 'relative max-h-[176px] overflow-hidden' : ''}>
                <Markdown text={m.text} className={color} />
                {collapsible && !isOpen && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0d0d10]/95 to-transparent" />
                )}
              </div>
              {collapsible && (
                <button
                  type="button"
                  onClick={() => setExpanded((cur) => ({ ...cur, [i]: !cur[i] }))}
                  className="mt-1 text-[11px] text-[#71717a] hover:text-[#d4d4d8]"
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
