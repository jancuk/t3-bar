import { Popover } from '@base-ui/react/popover';
import { Switch } from '@base-ui/react/switch';
import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { AppState, ClipboardPosition, Result, SettingsPatch } from '../../shared/types';
import { api, toUiError, type UiError } from '../lib/api';
import { ClipboardConsent } from './ClipboardConsent';
import { ClipboardPanel } from './ClipboardPanel';
import { iconBtnClass } from './IconButton';
import { ShortcutKeycap } from './ShortcutKeycap';

const switchCls =
  'relative h-[18px] w-8 shrink-0 rounded-full bg-white/15 outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-white/50 data-[checked]:bg-[#fafafa]';
const thumbCls =
  'absolute left-0.5 top-0.5 block size-[14px] rounded-full bg-[#fafafa] transition-transform duration-150 data-[checked]:translate-x-[14px] data-[checked]:bg-[#09090b]';
const field =
  'mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-[#fafafa] outline-none focus:border-white/30';

function Toggle({ checked, label, onChange, disabled }: { checked: boolean; label: string; onChange(next: boolean): void; disabled?: boolean }) {
  return (
    <Switch.Root checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} className={switchCls}>
      <Switch.Thumb className={thumbCls} />
    </Switch.Root>
  );
}

function Row({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5 text-[12.5px] text-[#e4e4e7]">
      <div>
        <div>{title}</div>
        {sub && <div className="mt-px text-[11px] leading-[1.3] text-[#71717a]">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

const Divider = () => <div className="h-px bg-white/[0.06]" />;

export function SettingsPopover({
  state, open, onOpenChange, onSave, onQuit, onState,
}: {
  state: AppState;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSave(patch: SettingsPatch): Promise<UiError | null>;
  onQuit(): void;
  onState(state: AppState): void;
}) {
  const s = state.settings;
  const [view, setView] = useState<'main' | 'consent'>('main');
  const [advanced, setAdvanced] = useState(false);
  const [cliPath, setCliPath] = useState(s.cliPath);
  const [serverUrl, setServerUrl] = useState(s.serverUrl);
  const [previewCount, setPreviewCount] = useState(String(s.previewCount));
  const [shortcut, setShortcut] = useState(s.shortcut);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCliPath(s.cliPath); setServerUrl(s.serverUrl); setPreviewCount(String(s.previewCount)); setShortcut(s.shortcut);
      setError(null); setView('main'); setAdvanced(false);
    }
    // Only reset when the popover opens.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const err = await onSave({ cliPath, serverUrl, previewCount: Number(previewCount), shortcut });
    setError(err?.message ?? null);
    if (!err) onOpenChange(false);
  };

  const run = async (call: () => Promise<Result<AppState>>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const r = await call();
    setBusy(false);
    if (r.ok) { onState(r.data); return true; }
    setError(toUiError(r).message);
    return false;
  };

  const toggleCapture = async (next: boolean) => {
    if (!next) {
      const err = await onSave({ clipboardCapture: false });
      if (err) setError(err.message);
      return;
    }
    if (!s.clipboardConsent) { setError(null); setView('consent'); return; }
    await run(() => api().enableClipboard());
  };

  const setPosition = async (clipboardPosition: ClipboardPosition) => {
    const err = await onSave({ clipboardPosition });
    if (err) setError(err.message);
  };

  const blocked = s.clipboardCapture && state.clipboard.state === 'blocked';
  const captureSub = !s.clipboardCapture
    ? 'Off by default · offer pill on copy'
    : blocked
      ? 'Paused until macOS allows access'
      : 'Pre-fills composer only (never sends)';

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger aria-label="Settings" className={iconBtnClass}>
        <SlidersHorizontal className="size-3.5" strokeWidth={1.8} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} alignOffset={-2} collisionPadding={8} className="z-50">
          <Popover.Popup
            data-overlay-open="true"
            finalFocus={false}
            className="flex max-h-[var(--available-height)] w-[312px] flex-col gap-[11px] overflow-y-auto rounded-[13px] bg-[rgba(20,20,24,0.96)] p-[13px] text-[#e4e4e7] shadow-[0_24px_60px_rgba(0,0,0,0.78),0_0_0_0.5px_rgba(255,255,255,0.14),inset_0_1px_0_rgba(255,255,255,0.13)] outline-none backdrop-blur-[28px]"
          >
            <Popover.Title className="sr-only">Settings</Popover.Title>
            {view === 'consent' ? (
              <ClipboardConsent
                busy={busy}
                error={error}
                onCancel={() => { setError(null); setView('main'); }}
                onAllow={() => void run(() => api().enableClipboard()).then((ok) => { if (ok) setView('main'); })}
              />
            ) : (
              <>
                {!blocked && (
                  <>
                    <Row title="Global shortcut" sub="Toggle from anywhere"><ShortcutKeycap accelerator={s.shortcut} /></Row>
                    {!state.shortcutOk && <p className="text-[11px] text-warn">The global shortcut could not be registered. Try another one.</p>}
                    <Row title="Auto-hide after send" sub="Return to previous app">
                      <Toggle checked={s.autoHideOnSend} label="Auto-hide after send" onChange={(c) => void onSave({ autoHideOnSend: c })} />
                    </Row>
                    <Row title="Show settled threads" sub="Include finished items">
                      <Toggle checked={s.showSettled} label="Show settled threads" onChange={(c) => void onSave({ showSettled: c })} />
                    </Row>
                    <Divider />
                  </>
                )}
                <Row title="Clipboard quick-capture" sub={captureSub}>
                  <Toggle checked={s.clipboardCapture} label="Clipboard quick-capture" disabled={busy} onChange={(c) => void toggleCapture(c)} />
                </Row>
                {s.clipboardCapture && (
                  <ClipboardPanel
                    state={state}
                    busy={busy}
                    onPosition={(p) => void setPosition(p)}
                    onOpenSettings={() => void api().openClipboardPrivacySettings()}
                    onRecheck={() => void run(() => api().recheckClipboard())}
                  />
                )}
                <Divider />
                <button
                  type="button"
                  aria-expanded={advanced}
                  onClick={() => setAdvanced((a) => !a)}
                  className="flex items-center justify-between text-left text-[11.5px] text-[#71717a] outline-none hover:text-[#a1a1aa] focus-visible:ring-1 focus-visible:ring-white/40"
                >
                  <span>Advanced (CLI path, port, preview)</span>
                  <span>{advanced ? '▾' : '▸'}</span>
                </button>
                {advanced && (
                  <div className="flex flex-col gap-2">
                    <label className="block text-[11px] text-[#71717a]">T3 CLI path
                      <input className={`${field} font-mono`} value={cliPath} onChange={(e) => setCliPath(e.target.value)} />
                    </label>
                    <label className="block text-[11px] text-[#71717a]">Server URL (loopback only)
                      <input className={`${field} font-mono`} value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
                    </label>
                    <div className="flex gap-2">
                      <label className="block flex-1 text-[11px] text-[#71717a]">Messages to preview
                        <input className={field} type="number" min={1} max={50} value={previewCount} onChange={(e) => setPreviewCount(e.target.value)} />
                      </label>
                      <label className="block flex-1 text-[11px] text-[#71717a]">Global shortcut
                        <input className={`${field} font-mono`} value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => void save()}
                      className="self-end rounded-md border border-white/[0.14] bg-white/[0.08] px-2 py-1 text-[11px] font-medium text-[#fafafa] outline-none hover:bg-white/[0.12] focus-visible:ring-1 focus-visible:ring-white/40"
                    >
                      Save
                    </button>
                  </div>
                )}
                {error && <p role="alert" className="selectable text-[11px] text-danger">{error}</p>}
                <Divider />
                <div className="flex items-center justify-between text-[11.5px]">
                  <button type="button" onClick={onQuit} className="text-[#f87171] opacity-85 outline-none hover:opacity-100 focus-visible:ring-1 focus-visible:ring-white/40">
                    Quit T3 Bar
                  </button>
                  <span className="text-[11px] text-[#52525b]">v{state.appVersion}</span>
                </div>
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
