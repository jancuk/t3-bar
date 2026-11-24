import { Tabs } from '@base-ui/react/tabs';
import { MessageSquarePlus, Reply } from 'lucide-react';
import type { Mode } from '../../shared/types';

const tab =
  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-neutral-400 outline-none ' +
  'transition-colors hover:text-neutral-100 focus-visible:ring-1 focus-visible:ring-accent data-[active]:bg-white/10 data-[active]:text-neutral-50';

export function ModeTabs({ mode, onChange }: { mode: Mode; onChange(m: Mode): void }) {
  return (
    <Tabs.Root value={mode} onValueChange={(v) => onChange(v === 'new' ? 'new' : 'reply')}>
      <Tabs.List className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-0.5">
        <Tabs.Tab value="reply" className={tab}><Reply className="size-3.5" />Reply</Tabs.Tab>
        <Tabs.Tab value="new" className={tab}><MessageSquarePlus className="size-3.5" />New thread</Tabs.Tab>
      </Tabs.List>
    </Tabs.Root>
  );
}
