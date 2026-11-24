import { Popover } from '@base-ui/react/popover';
import { Switch } from '@base-ui/react/switch';
import { Power, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppState, SettingsPatch } from '../../shared/types';
import type { UiError } from '../lib/api';
import { iconBtnClass } from './IconButton';

const field =
  'w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-accent/60';

export function SettingsPopover({
  state, onSave, onQuit,
}: { state: AppState; onSave(patch: SettingsPatch): Promise<UiError | null>; onQuit(): void }) {
  const s = state.settings;
  const [cliPath, setCliPath] = useState(s.cliPath);
  const [serverUrl, setServerUrl] = useState(s.serverUrl);
  const [previewCount, setPreviewCount] = useState(String(s.previewCount));
  const [shortcut, setShortcut] = useState(s.shortcut);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setCliPath(s.cliPath); setServerUrl(s.serverUrl); setPreviewCount(String(s.previewCount)); setShortcut(s.shortcut); setError(null);
    }
  }, [open, s.cliPath, s.serverUrl, s.previewCount, s.shortcut]);

  const save = async () => {
    const n = Number(previewCount);
    const err = await onSave({ cliPath, serverUrl, previewCount: n, shortcut });
    setError(err?.message ?? null);
    if (!err) setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger aria-label="Settings" className={iconBtnClass}><SettingsIcon className="size-4" /></Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={8} className="z-50">
          <Popover.Popup className="w-[340px] rounded-xl border border-white/10 bg-neutral-900/95 p-3 text-neutral-100 shadow-2xl outline-none backdrop-blur-xl">
            <Popover.Title className="mb-2 text-sm font-semibold">Settings</Popover.Title>
            <div className="space-y-2.5">
              <label className="block text-[11px] text-neutral-400">T3 CLI path
                <input className={`${field} mt-1 font-mono`} value={cliPath} onChange={(e) => setCliPath(e.target.value)} />
              </label>
              <label className="block text-[11px] text-neutral-400">Server URL (loopback only)
                <input className={`${field} mt-1 font-mono`} value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
              </label>
              <div className="flex gap-2">
                <label className="block flex-1 text-[11px] text-neutral-400">Messages to preview
                  <input className={`${field} mt-1`} type="number" min={1} max={50} value={previewCount} onChange={(e) => setPreviewCount(e.target.value)} />
                </label>
                <label className="block flex-1 text-[11px] text-neutral-400">Global shortcut
                  <input className={`${field} mt-1 font-mono`} value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
                </label>
              </div>
              {!state.shortcutOk && <p className="text-[11px] text-warn">The global shortcut could not be registered. Try another one.</p>}
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-300">Show settled threads</span>
                <Switch.Root
                  checked={s.showSettled}
                  onCheckedChange={(c) => void onSave({ showSettled: c })}
                  aria-label="Show settled threads"
                  className="relative h-5 w-9 rounded-full bg-white/15 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent data-[checked]:bg-accent/80"
                >
                  <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white transition-transform data-[checked]:translate-x-[18px]" />
                </Switch.Root>
              </div>
              {error && <p role="alert" className="selectable text-xs text-danger">{error}</p>}
              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={onQuit} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-danger hover:bg-danger/10">
                  <Power className="size-3.5" />Quit
                </button>
                <button type="button" onClick={() => void save()} className="rounded-md bg-accent/90 px-3 py-1 text-xs font-medium text-neutral-950 hover:bg-accent">
                  Save
                </button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
