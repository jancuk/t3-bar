import { Pin } from 'lucide-react';
import type { ReactElement } from 'react';
import type { AppState, Health, SettingsPatch } from '../../shared/types';
import type { UiError } from '../lib/api';
import { IconButton } from './IconButton';
import { SettingsPopover } from './SettingsPopover';
import { StatusDot } from './StatusDot';

export function ContextBar({
  state, health, checking, envMenu, targetPalette, settingsOpen, onSettingsOpenChange, onRetry, onPin, onSave, onQuit,
}: {
  state: AppState;
  health: Health | null;
  checking: boolean;
  envMenu: ReactElement;
  targetPalette: ReactElement;
  settingsOpen: boolean;
  onSettingsOpenChange(open: boolean): void;
  onRetry(): void;
  onPin(pinned: boolean): void;
  onSave(patch: SettingsPatch): Promise<UiError | null>;
  onQuit(): void;
}) {
  const pinned = state.settings.pinned;
  return (
    <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-2">
      <div className="flex min-w-0 items-center">
        {envMenu}
        <span aria-hidden className="px-0.5 text-neutral-600">/</span>
        {targetPalette}
      </div>
      <div className="flex shrink-0 items-center">
        <StatusDot health={health} checking={checking} onRetry={onRetry} />
        <IconButton
          label={pinned ? 'Unpin launcher' : 'Keep launcher open'}
          aria-pressed={pinned}
          onClick={() => onPin(!pinned)}
          className={pinned ? 'text-accent' : ''}
        >
          <Pin className={`size-3.5 ${pinned ? 'fill-current' : ''}`} />
        </IconButton>
        <SettingsPopover state={state} open={settingsOpen} onOpenChange={onSettingsOpenChange} onSave={onSave} onQuit={onQuit} />
      </div>
    </header>
  );
}
