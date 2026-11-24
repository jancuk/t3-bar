import { Popover } from '@base-ui/react/popover';
import { ChevronsUpDown, KeyRound, Laptop, Monitor, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { LOCAL_ENV_ID, type AppState, type RemoteEnvironmentSummary } from '../../shared/types';
import { api, toUiError } from '../lib/api';
import { AddEnvironmentForm } from './AddEnvironmentForm';

type Dot = 'unknown' | 'ok' | 'bad';
type View = { kind: 'list' } | { kind: 'add' } | { kind: 'token'; env: RemoteEnvironmentSummary };

const ADD_ID = '__add';
const dotCls: Record<Dot, string> = { unknown: 'bg-neutral-600', ok: 'bg-ok', bad: 'bg-danger' };

export function EnvironmentTrigger({ label, remote, ...rest }: { label: string; remote: boolean } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label="Choose machine"
      {...rest}
      className="flex h-7 min-w-0 max-w-[170px] items-center gap-1.5 rounded-md px-2 text-[12.5px] text-neutral-100 outline-none transition-colors hover:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-accent data-[popup-open]:bg-white/[0.1]"
    >
      {remote ? <Monitor className="size-3.5 shrink-0 text-neutral-400" /> : <Laptop className="size-3.5 shrink-0 text-neutral-400" />}
      <span className="truncate font-medium">{label}</span>
      <ChevronsUpDown className="size-3 shrink-0 text-neutral-600" />
    </button>
  );
}

export function EnvironmentMenu({
  state, open, onOpenChange, onSelect,
}: {
  state: AppState;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSelect(envId: string): void;
}) {
  const { environments, activeEnvironmentId } = state.settings;
  const active = environments.find((e) => e.id === activeEnvironmentId) ?? null;
  const [view, setView] = useState<View>({ kind: 'list' });
  const [index, setIndex] = useState(0);
  const [dots, setDots] = useState<Record<string, Dot>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const ids = [LOCAL_ENV_ID, ...environments.map((e) => e.id), ADD_ID];

  // Reset on open, then probe every machine quickly for the status dots.
  useEffect(() => {
    if (!open) return;
    setView({ kind: 'list' });
    setConfirmId(null);
    setNote(null);
    const at = ids.indexOf(activeEnvironmentId);
    setIndex(at >= 0 ? at : 0);
    let cancelled = false;
    setDots({});
    for (const id of [LOCAL_ENV_ID, ...environments.map((e) => e.id)]) {
      void api().checkHealth(id, { quick: true }).then((r) => {
        if (!cancelled) setDots((d) => ({ ...d, [id]: r.ok && r.data.reachable ? 'ok' : 'bad' }));
      });
    }
    return () => { cancelled = true; };
    // Only when the menu opens.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && view.kind === 'list') listRef.current?.focus();
  }, [open, view.kind]);

  const choose = (id: string) => {
    if (id === ADD_ID) { setView({ kind: 'add' }); return; }
    onSelect(id);
    onOpenChange(false);
  };

  const remove = async (id: string) => {
    setConfirmId(null);
    const r = await api().removeEnvironment(id);
    if (!r.ok) setNote(toUiError(r).message);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (confirmId) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setConfirmId(null); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, ids.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && e.target === e.currentTarget) {
      e.preventDefault();
      const id = ids[index];
      if (id) choose(id);
    } else if (e.target === e.currentTarget) {
      const id = ids[index];
      const highlightedEnv = environments.find((x) => x.id === id) ?? null;
      if (!highlightedEnv) return;
      if (e.key.toLowerCase() === 'u') { e.preventDefault(); setView({ kind: 'token', env: highlightedEnv }); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); setConfirmId(highlightedEnv.id); }
    }
  };

  const rowCls = (on: boolean) =>
    `group flex h-9 cursor-default items-center gap-2 rounded-md px-2 text-[13px] text-neutral-100 ${on ? 'bg-white/[0.09]' : ''}`;
  const iconAct =
    'flex size-5 items-center justify-center rounded text-neutral-400 outline-none hover:bg-white/10 hover:text-neutral-100 focus-visible:ring-1 focus-visible:ring-accent';

  const row = (id: string, name: string, sub: string | undefined, env: RemoteEnvironmentSummary | null) => {
    const on = ids[index] === id;
    const confirming = confirmId === id;
    return (
      <div
        key={id}
        id={`env-${id}`}
        role="option"
        aria-selected={activeEnvironmentId === id}
        onMouseMove={() => setIndex(ids.indexOf(id))}
        onClick={() => { if (!confirming) choose(id); }}
        className={rowCls(on)}
      >
        <span className={`size-1.5 shrink-0 rounded-full ${dotCls[dots[id] ?? 'unknown']}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate leading-tight">{name}</span>
          {sub && <span className="block truncate text-[10.5px] leading-tight text-neutral-500">{sub}</span>}
        </span>
        {confirming ? (
          <span className="flex items-center gap-1 text-[11px]" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => void remove(id)} className="rounded bg-danger/20 px-1.5 py-0.5 text-danger hover:bg-danger/30">Remove</button>
            <button type="button" onClick={() => setConfirmId(null)} className="rounded px-1.5 py-0.5 text-neutral-400 hover:bg-white/10">Cancel</button>
          </span>
        ) : (
          <>
            {activeEnvironmentId === id && <span className="size-1.5 rounded-full bg-accent group-hover:hidden group-focus-within:hidden" />}
            {env && (
              <span className="hidden items-center gap-0.5 group-hover:flex group-focus-within:flex">
                <button type="button" aria-label={`Update token for ${env.label}`} title="Update token" onClick={(e) => { e.stopPropagation(); setView({ kind: 'token', env }); }} className={iconAct}>
                  <KeyRound className="size-3.5" />
                </button>
                <button type="button" aria-label={`Remove ${env.label}`} title="Remove machine" onClick={(e) => { e.stopPropagation(); setConfirmId(id); }} className={`${iconAct} hover:!bg-danger/20 hover:!text-danger`}>
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger render={<EnvironmentTrigger label={active ? active.label : 'Local'} remote={active !== null} />} />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-50">
          <Popover.Popup
            data-overlay-open="true"
            initialFocus={view.kind === 'list' ? listRef : undefined}
            finalFocus={false}
            className="flex max-h-[var(--available-height)] w-[330px] flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 text-neutral-100 shadow-2xl outline-none backdrop-blur-xl"
          >
            <Popover.Title className="sr-only">Choose machine</Popover.Title>
            {view.kind === 'list' ? (
              <>
                <div
                  ref={listRef}
                  tabIndex={-1}
                  role="listbox"
                  aria-label="Machines"
                  aria-activedescendant={`env-${ids[index]}`}
                  onKeyDown={onKeyDown}
                  className="min-h-0 flex-1 overflow-y-auto p-1.5 outline-none"
                >
                  {row(LOCAL_ENV_ID, 'Local', 'This Mac', null)}
                  {environments.map((e) => row(e.id, e.label, new URL(e.origin).host, e))}
                </div>
                <div className="border-t border-white/[0.06] p-1.5">
                  {note && <p role="alert" className="selectable px-2 pb-1.5 pt-1 text-[11.5px] leading-snug text-danger">{note}</p>}
                  <button
                    type="button"
                    id={`env-${ADD_ID}`}
                    onClick={() => setView({ kind: 'add' })}
                    onMouseMove={() => setIndex(ids.indexOf(ADD_ID))}
                    className={`flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-neutral-300 outline-none hover:bg-white/[0.08] focus-visible:bg-white/[0.08] ${ids[index] === ADD_ID ? 'bg-white/[0.09]' : ''}`}
                  >
                    <Plus className="size-3.5 text-neutral-500" />Add remote machine…
                  </button>
                </div>
              </>
            ) : (
              <AddEnvironmentForm
                env={view.kind === 'token' ? view.env : null}
                secretsAvailable={state.secretsAvailable}
                onBack={() => setView({ kind: 'list' })}
                onDone={() => {
                  // `add` already switched the active machine; a token update keeps it.
                  onOpenChange(false);
                }}
              />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
