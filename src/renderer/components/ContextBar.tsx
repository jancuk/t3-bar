import { Pin } from 'lucide-react';
import type { AppState, Health, SavedProject, SettingsPatch } from '../../shared/types';
import type { UiError } from '../lib/api';
import { IconButton } from './IconButton';
import { SettingsPopover } from './SettingsPopover';
import { StatusDot } from './StatusDot';
import { TargetPalette } from './TargetPalette';
import { TargetPill } from './TargetPill';

export function ContextBar({
  state, project, health, checking, paletteOpen, onPaletteOpenChange, settingsOpen, onSettingsOpenChange, onSelectTarget, onRetry, onPin, onSave, onQuit,
}: {
  state: AppState;
  project: SavedProject | null;
  health: Health | null;
  checking: boolean;
  paletteOpen: boolean;
  onPaletteOpenChange(open: boolean): void;
  settingsOpen: boolean;
  onSettingsOpenChange(open: boolean): void;
  onSelectTarget(id: string): void;
  onRetry(): void;
  onPin(pinned: boolean): void;
  onSave(patch: SettingsPatch): Promise<UiError | null>;
  onQuit(): void;
}) {
  const pinned = state.settings.pinned;
  return (
    <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-2">
      <TargetPalette
        state={state}
        open={paletteOpen}
        onOpenChange={onPaletteOpenChange}
        onSelect={onSelectTarget}
        trigger={<TargetPill project={project} homeDir={state.homeDir} />}
      />
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
