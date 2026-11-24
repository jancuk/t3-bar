import { Pin } from 'lucide-react';
import type { ReactElement } from 'react';
import type { AppState, Health } from '../../shared/types';
import { IconButton } from './IconButton';
import { StatusDot } from './StatusDot';

export function ContextBar({
  state, health, checking, targetPalette, settingsPopover, prefillActive, onRetry, onPin,
}: {
  state: AppState;
  health: Health | null;
  checking: boolean;
  targetPalette: ReactElement;
  settingsPopover: ReactElement;
  prefillActive: boolean;
  onRetry(): void;
  onPin(pinned: boolean): void;
}) {
  const pinned = state.settings.pinned;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center">{targetPalette}</div>
      <div className="flex shrink-0 items-center gap-1">
        {prefillActive && (
          <span className="mr-1 inline-flex items-center gap-[5px] rounded-full border border-[rgba(52,211,153,0.22)] bg-[rgba(52,211,153,0.1)] px-2 py-0.5 text-[10.5px] text-ok">
            Pasted from clipboard · not sent
          </span>
        )}
        <StatusDot health={health} checking={checking} onRetry={onRetry} />
        <IconButton
          label={pinned ? 'Unpin launcher' : 'Keep launcher open'}
          aria-pressed={pinned}
          onClick={() => onPin(!pinned)}
          className={pinned ? 'bg-white/[0.08] text-[#f4f4f5]' : ''}
        >
          <Pin className={`size-[13px] ${pinned ? 'fill-current' : ''}`} strokeWidth={1.8} />
        </IconButton>
        {settingsPopover}
      </div>
    </div>
  );
}
