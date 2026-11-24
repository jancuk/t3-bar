import type { AppState, Health, SettingsPatch } from '../../shared/types';
import type { UiError } from '../lib/api';
import { ConnectionBadge } from './ConnectionBadge';
import { PinToggle } from './PinToggle';
import { SettingsPopover } from './SettingsPopover';

export function Header({
  state, health, checking, onRetry, onPin, onSave, onQuit,
}: {
  state: AppState; health: Health | null; checking: boolean; onRetry(): void;
  onPin(p: boolean): void; onSave(patch: SettingsPatch): Promise<UiError | null>; onQuit(): void;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-3">
      <div className="flex items-center gap-2">
        <div className="flex size-5 items-center justify-center rounded-md border border-white/30 text-[10px] font-bold">T</div>
        <h1 className="text-[13px] font-semibold tracking-tight">T3 Widget</h1>
        <ConnectionBadge health={health} checking={checking} onRetry={onRetry} />
      </div>
      <div className="flex items-center gap-0.5">
        <PinToggle pinned={state.settings.pinned} onChange={onPin} />
        <SettingsPopover state={state} onSave={onSave} onQuit={onQuit} />
      </div>
    </header>
  );
}
