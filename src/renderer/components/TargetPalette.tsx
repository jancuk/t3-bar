import { Popover } from '@base-ui/react/popover';
import { ExternalLink, Loader2, MessageSquareDashed, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { filterTargets, flattenForNav, groupProjectsByParent, tildify } from '../../shared/targets';
import { NO_PROJECT_ID, type AppState } from '../../shared/types';
import { api, toUiError } from '../lib/api';
import { rowSelectedClass } from './ThreadRow';

const footerBtn =
  'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-[#a1a1aa] outline-none transition-colors hover:bg-white/[0.06] hover:text-[#fafafa] focus-visible:bg-white/[0.06] focus-visible:text-[#fafafa] disabled:opacity-50';

export function TargetPalette({
  state, activeTargetId, open, onOpenChange, onSelect, trigger,
}: {
  state: AppState;
  activeTargetId: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSelect(id: string): void;
  trigger: ReactElement;
}) {
  const projects = state.settings.projects;
  const home = state.homeDir;
  const noProjectId = NO_PROJECT_ID;
  const hasNoProject = true;
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => groupProjectsByParent(projects, home), [projects, home]);
  const filtered = useMemo(() => filterTargets(query, groups), [query, groups]);
  const showNoProject = filtered.includeNoProject && hasNoProject;
  const ids = useMemo(() => flattenForNav(filtered.groups, showNoProject), [filtered, showNoProject]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setNote(null);
      const allIds = flattenForNav(groups, hasNoProject);
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
    const r = await api().openProjectInApp(id);
    if (!r.ok) fail(r);
  };

  const rowCls = (on: boolean) =>
    `group flex h-[31px] cursor-default items-center gap-[9px] rounded-lg px-2.5 text-[13px] text-[#d4d4d8] ${on ? rowSelectedClass : ''}`;
  const active = ids[index];

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} alignOffset={-2} collisionPadding={8} className="z-50">
          <Popover.Popup
            data-overlay-open="true"
            initialFocus={inputRef}
            finalFocus={false}
            className="glass-popover flex max-h-[var(--available-height)] w-[310px] flex-col overflow-hidden rounded-xl text-[#d4d4d8] outline-none"
          >
            <Popover.Title className="sr-only">Choose where to send</Popover.Title>
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3">
              <Search className="size-[13px] shrink-0 text-[#52525b]" strokeWidth={2} />
              <input
                ref={inputRef}
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls="target-list"
                aria-activedescendant={active ? `target-${active}` : undefined}
                aria-label="Search folders"
                value={query}
                placeholder="Search folders…"
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
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[#fafafa] outline-none placeholder:text-[#52525b]"
              />
            </div>

            <div id="target-list" role="listbox" aria-label="Folders" className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-1.5" style={{ maxHeight: 220 }}>
              {showNoProject && (
                <div
                  id={`target-${noProjectId}`}
                  role="option"
                  aria-selected={active === noProjectId}
                  onMouseMove={() => setIndex(ids.indexOf(noProjectId))}
                  onClick={() => choose(noProjectId)}
                  className={rowCls(active === noProjectId)}
                >
                  <MessageSquareDashed className="size-[13px] shrink-0 text-[#a1a1aa]" strokeWidth={1.8} />
                  <span className="flex-1 truncate tracking-[-0.01em]">No project</span>
                  {activeTargetId === noProjectId ? <span className="size-1.5 rounded-full bg-[#fafafa]" /> : <span className="shrink-0 text-[11px] text-[#52525b]">Scratch</span>}
                </div>
              )}
              {filtered.groups.map((g) => (
                <div key={g.key} role="group" aria-label={g.label}>
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[#52525b]">{g.label}</div>
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
                      <span className="flex-1 truncate tracking-[-0.01em]">{p.name}</span>
                      {activeTargetId === p.id && <span className="size-1.5 rounded-full bg-[#fafafa] group-hover:hidden" />}
                      <span className="hidden items-center gap-0.5 group-hover:flex">
                        <button
                          type="button"
                          aria-label={`Open ${p.name} in T3 Code`}
                          title="Open in T3 Code"
                          onClick={(e) => { e.stopPropagation(); void openInApp(p.id); }}
                          className="flex size-5 items-center justify-center rounded text-[#a1a1aa] hover:bg-white/10 hover:text-[#fafafa]"
                        ><ExternalLink className="size-3.5" /></button>
                        <button
                          type="button"
                          aria-label={`Remove ${p.name}`}
                          title="Remove from launcher"
                          onClick={(e) => { e.stopPropagation(); void remove(p.id); }}
                          className="flex size-5 items-center justify-center rounded text-[#a1a1aa] hover:bg-danger/20 hover:text-danger"
                        ><Trash2 className="size-3.5" /></button>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {ids.length === 0 && <p className="px-2 py-3 text-xs text-[#52525b]">No matching folders.</p>}
            </div>

            <div className="border-t border-white/[0.06] p-1.5">
              {note && (
                <p role={note.kind === 'error' ? 'alert' : 'status'} className={`selectable px-2 pb-1.5 pt-1 text-[11.5px] leading-snug ${note.kind === 'error' ? 'text-danger' : 'text-[#a1a1aa]'}`}>
                  {note.text}
                </p>
              )}
              <button type="button" className={footerBtn} onClick={() => void addFolder()} disabled={scanning}>
                <span className="w-[13px] text-center text-[13px] leading-none">+</span>Add folder…
              </button>
              <button type="button" className={footerBtn} onClick={() => void scan()} disabled={scanning}>
                {scanning ? <Loader2 className="size-[13px] animate-spin" /> : <span className="w-[13px] text-center text-[13px] leading-none">⌕</span>}
                {scanning ? 'Scanning…' : 'Scan parent folder…'}
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
