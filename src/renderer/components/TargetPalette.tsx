import { Popover } from '@base-ui/react/popover';
import { ExternalLink, FolderPlus, FolderSearch, Loader2, MessageSquareDashed, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { filterTargets, flattenForNav, groupProjectsByParent, guessRemoteHome, tildify } from '../../shared/targets';
import { NO_PROJECT_ID, type AppState, type RemoteProject, type SavedProject } from '../../shared/types';
import { api, toUiError, type UiError } from '../lib/api';

const footerBtn =
  'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-neutral-300 outline-none transition-colors hover:bg-white/[0.08] focus-visible:bg-white/[0.08] disabled:opacity-50';

export interface RemoteTargets {
  envId: string;
  envLabel: string;
  projects: RemoteProject[] | null;
  loading: boolean;
  error: UiError | null;
  refresh(): void;
}

export function TargetPalette({
  state, remote, activeTargetId, open, onOpenChange, onSelect, trigger,
}: {
  state: AppState;
  /** Set when a remote machine is active. Local mode uses the saved folders in settings. */
  remote: RemoteTargets | null;
  activeTargetId: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSelect(id: string): void;
  trigger: ReactElement;
}) {
  const scratch = remote?.projects?.find((p) => p.isScratch) ?? null;
  const projects: SavedProject[] = useMemo(
    () => remote
      ? (remote.projects ?? []).filter((p) => !p.isScratch).map((p) => ({ id: p.id, name: p.name, path: p.path }))
      : [...state.settings.projects],
    [remote, state.settings.projects],
  );
  const home = remote ? guessRemoteHome(projects.map((p) => p.path)) : state.homeDir;
  const noProjectId = remote ? (scratch?.id ?? '') : NO_PROJECT_ID;
  const hasNoProject = remote ? scratch !== null : true;
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => groupProjectsByParent(projects, home), [projects, home]);
  const filtered = useMemo(() => filterTargets(query, groups), [query, groups]);
  const showNoProject = filtered.includeNoProject && hasNoProject;
  const ids = useMemo(() => flattenForNav(filtered.groups, showNoProject, noProjectId), [filtered, showNoProject, noProjectId]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setNote(null);
      const allIds = flattenForNav(groups, hasNoProject, noProjectId);
      const at = allIds.indexOf(activeTargetId);
      setIndex(at >= 0 ? at : 0);
    }
    // Only reset when the palette opens.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const id = ids[index];
    if (id) document.getElementById(`target-${id}`)?.scrollIntoView({ block: 'nearest' });
  }, [index, open, ids]);

  const choose = (id: string) => { onSelect(id); onOpenChange(false); };
  const fail = (r: { code: Parameters<typeof toUiError>[0]['code']; message: string }) =>
    setNote({ kind: 'error', text: toUiError({ ok: false, ...r }).message });

  const addFolder = async () => {
    setNote(null);
    const r = await api().addFolder();
    if (!r.ok) return fail(r);
    if (r.data) onOpenChange(false);
  };

  const scan = async () => {
    setNote(null);
    setScanning(true);
    const r = await api().scanFolder();
    setScanning(false);
    if (!r.ok) return fail(r);
    const s = r.data;
    if (!s) return;
    const where = tildify(s.parent, state.homeDir);
    const n = s.added.length;
    let text = n > 0 ? `Added ${n} project${n === 1 ? '' : 's'} from ${where}` : `No new projects in ${where}`;
    if (n === 0 && s.alreadySaved > 0) text = `Nothing new in ${where} (${s.alreadySaved} already added)`;
    if (s.failed > 0) text += `, ${s.failed} could not be checked`;
    if (s.truncated) text += '. Only the first 40 folders were scanned';
    setNote({ kind: 'info', text });
  };

  const remove = async (id: string) => {
    const r = await api().removeProject(id);
    if (!r.ok) fail(r);
  };
  const openInApp = async (id: string) => {
    const r = await api().openProjectInApp(remote?.envId ?? 'local', id);
    if (!r.ok) fail(r);
  };

  const rowCls = (on: boolean) =>
    `group flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] text-neutral-100 ${on ? 'bg-white/[0.09]' : ''}`;
  const active = ids[index];

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-50">
          <Popover.Popup
            data-overlay-open="true"
            initialFocus={inputRef}
            finalFocus={false}
            className="flex max-h-[var(--available-height)] w-[360px] flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 text-neutral-100 shadow-2xl outline-none backdrop-blur-xl"
          >
            <Popover.Title className="sr-only">Choose where to send</Popover.Title>
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3">
              <Search className="size-3.5 shrink-0 text-neutral-500" />
              <input
                ref={inputRef}
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls="target-list"
                aria-activedescendant={active ? `target-${active}` : undefined}
                aria-label={remote ? `Search ${remote.envLabel} projects` : 'Search folders'}
                value={query}
                placeholder={remote ? `Search ${remote.envLabel}…` : 'Search folders…'}
                onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, ids.length - 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
                  else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (active) choose(active);
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-100 outline-none placeholder:text-neutral-500"
              />
            </div>

            <div id="target-list" role="listbox" aria-label="Folders" className="min-h-0 flex-1 overflow-y-auto p-1.5" style={{ maxHeight: 220 }}>
              {showNoProject && (
                <div
                  id={`target-${noProjectId}`}
                  role="option"
                  aria-selected={active === noProjectId}
                  onMouseMove={() => setIndex(ids.indexOf(noProjectId))}
                  onClick={() => choose(noProjectId)}
                  className={rowCls(active === noProjectId)}
                >
                  <MessageSquareDashed className="size-3.5 shrink-0 text-neutral-400" />
                  <span className="flex-1 truncate">No project</span>
                  {activeTargetId === noProjectId && <span className="size-1.5 rounded-full bg-accent" />}
                </div>
              )}
              {filtered.groups.map((g) => (
                <div key={g.key} role="group" aria-label={g.label}>
                  <div className="px-2 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500">{g.label}</div>
                  {g.items.map((p) => (
                    <div
                      key={p.id}
                      id={`target-${p.id}`}
                      role="option"
                      aria-selected={active === p.id}
                      onMouseMove={() => setIndex(ids.indexOf(p.id))}
                      onClick={() => choose(p.id)}
                      className={rowCls(active === p.id)}
                    >
                      <span className="flex-1 truncate">{p.name}</span>
                      {activeTargetId === p.id && <span className="size-1.5 rounded-full bg-accent group-hover:hidden" />}
                      <span className="hidden items-center gap-0.5 group-hover:flex">
                        <button
                          type="button"
                          aria-label={`Open ${p.name} in T3 Code`}
                          title="Open in T3 Code"
                          onClick={(e) => { e.stopPropagation(); void openInApp(p.id); }}
                          className="flex size-5 items-center justify-center rounded text-neutral-400 hover:bg-white/10 hover:text-neutral-100"
                        ><ExternalLink className="size-3.5" /></button>
                        {!remote && <button
                          type="button"
                          aria-label={`Remove ${p.name}`}
                          title="Remove from launcher"
                          onClick={(e) => { e.stopPropagation(); void remove(p.id); }}
                          className="flex size-5 items-center justify-center rounded text-neutral-400 hover:bg-danger/20 hover:text-danger"
                        ><Trash2 className="size-3.5" /></button>}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {remote?.error && <p role="alert" className="px-2 py-3 text-xs text-danger">{remote.error.message}</p>}
              {!remote?.error && remote && remote.projects === null && <p className="px-2 py-3 text-xs text-neutral-500">Loading projects…</p>}
              {ids.length === 0 && !(remote && (remote.projects === null || remote.error)) && <p className="px-2 py-3 text-xs text-neutral-500">No matching folders.</p>}
            </div>

            <div className="border-t border-white/[0.06] p-1.5">
              {note && (
                <p role={note.kind === 'error' ? 'alert' : 'status'} className={`selectable px-2 pb-1.5 pt-1 text-[11.5px] leading-snug ${note.kind === 'error' ? 'text-danger' : 'text-neutral-400'}`}>
                  {note.text}
                </p>
              )}
              {remote ? (
                <button type="button" className={footerBtn} onClick={remote.refresh} disabled={remote.loading}>
                  <RefreshCw className={`size-3.5 text-neutral-500 ${remote.loading ? 'animate-spin' : ''}`} />Refresh projects
                </button>
              ) : (
                <>
                  <button type="button" className={footerBtn} onClick={() => void addFolder()} disabled={scanning}>
                    <FolderPlus className="size-3.5 text-neutral-500" />Add folder…
                  </button>
                  <button type="button" className={footerBtn} onClick={() => void scan()} disabled={scanning}>
                    {scanning ? <Loader2 className="size-3.5 animate-spin text-neutral-500" /> : <FolderSearch className="size-3.5 text-neutral-500" />}
                    {scanning ? 'Scanning…' : 'Scan parent folder…'}
                  </button>
                </>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
