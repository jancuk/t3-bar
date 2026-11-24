import { Toggle } from '@base-ui/react/toggle';
import { Tooltip } from '@base-ui/react/tooltip';
import { Pin, PinOff } from 'lucide-react';
import { iconBtnClass } from './IconButton';

export function PinToggle({ pinned, onChange }: { pinned: boolean; onChange(p: boolean): void }) {
  const label = pinned ? 'Unpin (hide on blur)' : 'Pin on top';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <Toggle pressed={pinned} onPressedChange={onChange} aria-label={label} className={iconBtnClass}>
            {pinned ? <Pin className="size-4" /> : <PinOff className="size-4" />}
          </Toggle>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} collisionPadding={8}>
          <Tooltip.Popup className="rounded-md border border-white/10 bg-neutral-900/95 px-2 py-1 text-xs text-neutral-200 shadow-lg">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
