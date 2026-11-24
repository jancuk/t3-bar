import { Menu } from '@base-ui/react/menu';
import { AppWindow, Check, ChevronDown, FolderPlus, Folder, Trash2 } from 'lucide-react';
import type { SavedProject } from '../../shared/types';

const item =
  'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-neutral-200 outline-none data-[highlighted]:bg-white/10';

export function ProjectPicker({
  projects, activeId, onSelect, onAdd, onRemove, onOpenInApp,
}: {
  projects: SavedProject[]; activeId: string | null; onSelect(id: string): void;
  onAdd(): void; onRemove(id: string): void; onOpenInApp(id: string): void;
}) {
  const active = projects.find((p) => p.id === activeId) ?? null;
  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-[13px] outline-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-accent data-[popup-open]:bg-white/10"
      >
        <Folder className="size-4 shrink-0 text-neutral-400" />
        <span className="min-w-0 flex-1 truncate">{active ? active.name : 'No project'}</span>
        <ChevronDown className="size-3.5 text-neutral-500" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} collisionPadding={8} align="start" className="z-50">
          <Menu.Popup className="w-[var(--anchor-width)] min-w-[220px] rounded-lg border border-white/10 bg-neutral-900/95 p-1 shadow-xl outline-none backdrop-blur-xl">
            {projects.map((p) => (
              <Menu.Item key={p.id} className={item} onClick={() => onSelect(p.id)}>
                <span className="flex size-4 items-center justify-center">{p.id === activeId && <Check className="size-3.5 text-accent" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.name}</span>
                  <span className="block truncate text-[11px] text-neutral-500">{p.path}</span>
                </span>
              </Menu.Item>
            ))}
            {projects.length > 0 && <Menu.Separator className="my-1 h-px bg-white/10" />}
            <Menu.Item className={item} onClick={onAdd}><FolderPlus className="size-4" />Add project…</Menu.Item>
            {active && (
              <>
                <Menu.Item className={item} onClick={() => onOpenInApp(active.id)}><AppWindow className="size-4" />Open in T3 Code</Menu.Item>
                <Menu.Item className={`${item} text-danger`} onClick={() => onRemove(active.id)}><Trash2 className="size-4" />Remove from widget</Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
