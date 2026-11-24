import { Select } from '@base-ui/react/select';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo } from 'react';
import type { ThreadSummary } from '../../shared/types';
import { relativeTime, statusTone, toneClass, truncate } from '../lib/format';

export function ThreadSelect({
  threads, value, onChange, loading,
}: { threads: ThreadSummary[]; value: string | null; onChange(id: string): void; loading: boolean }) {
  const items = useMemo(() => threads.map((t) => ({ value: t.threadId, label: truncate(t.title, 60) })), [threads]);
  return (
    <Select.Root items={items} value={value} onValueChange={(v) => { if (typeof v === 'string') onChange(v); }}>
      <Select.Trigger
        aria-label="Thread"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-[13px] outline-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-accent data-[popup-open]:bg-white/10"
      >
        <Select.Value placeholder={loading ? 'Loading threads…' : threads.length ? 'Choose a thread' : 'No threads yet'} className="min-w-0 flex-1 truncate" />
        <Select.Icon><ChevronsUpDown className="size-3.5 text-neutral-500" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner alignItemWithTrigger={false} sideOffset={6} collisionPadding={8} className="z-50">
          <Select.Popup className="max-h-[280px] w-[var(--anchor-width)] overflow-y-auto rounded-lg border border-white/10 bg-neutral-900/95 p-1 shadow-xl outline-none backdrop-blur-xl">
            <Select.List>
              {threads.map((t) => (
                <Select.Item
                  key={t.threadId}
                  value={t.threadId}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-white/10"
                >
                  <span className={`size-1.5 shrink-0 rounded-full ${toneClass[statusTone(t.status)]}`} />
                  <Select.ItemText className="min-w-0 flex-1 truncate">{truncate(t.title, 60)}</Select.ItemText>
                  <span className="shrink-0 text-[11px] text-neutral-500">{relativeTime(t.updatedAt)}</span>
                  <Select.ItemIndicator><Check className="size-3.5 text-accent" /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
