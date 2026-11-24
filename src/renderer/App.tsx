import { Tooltip } from '@base-ui/react/tooltip';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Mode } from '../shared/types';
import { AddProjectDialog } from './components/AddProjectDialog';
import { Composer } from './components/Composer';
import { Header } from './components/Header';
import { MessagePreview } from './components/MessagePreview';
import { ModeTabs } from './components/ModeTabs';
import { NewThreadFields } from './components/NewThreadFields';
import { ProjectPicker } from './components/ProjectPicker';
import { ThreadSelect } from './components/ThreadSelect';
import { ToastStack } from './components/Toast';
import { useAppState } from './hooks/useAppState';
import { useConnection } from './hooks/useConnection';
import { useThreadDetail } from './hooks/useThreadDetail';
import { useThreads } from './hooks/useThreads';
import { useToast } from './hooks/useToast';
import { api, toUiError } from './lib/api';

export function App() {
  const { state, error: stateError, update } = useAppState();
  const settings = state?.settings;
  const projectId = settings?.activeProjectId ?? null;
  const { health, checking, check } = useConnection(settings?.serverUrl);
  const { threads, loading: threadsLoading, error: threadsError, refresh: refreshThreads } = useThreads(projectId);
  const { toasts, push, dismiss } = useToast();

  const [mode, setModeState] = useState<Mode>('reply');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => { if (settings) setModeState(settings.lastMode); }, [settings?.lastMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleThreads = useMemo(() => {
    const selected = projectId ? settings?.lastThreadByProject[projectId] : undefined;
    return threads.filter((t) => settings?.showSettled || (!t.settled && !t.archived) || t.threadId === selected);
  }, [threads, settings?.showSettled, settings?.lastThreadByProject, projectId]);

  const savedThread = projectId ? settings?.lastThreadByProject[projectId] ?? null : null;
  const threadId = useMemo(() => {
    if (savedThread && visibleThreads.some((t) => t.threadId === savedThread)) return savedThread;
    return visibleThreads[0]?.threadId ?? null;
  }, [savedThread, visibleThreads]);

  const { detail, loading: detailLoading, error: detailError, refresh: refreshDetail } = useThreadDetail(
    projectId, mode === 'reply' ? threadId : null, settings?.previewCount ?? 8,
  );

  const setMode = useCallback((m: Mode) => { setModeState(m); void update({ lastMode: m }); }, [update]);
  const selectThread = useCallback((id: string) => {
    if (!projectId || !settings) return;
    void update({ lastThreadByProject: { ...settings.lastThreadByProject, [projectId]: id } });
  }, [projectId, settings, update]);

  // Esc hides the popup, unless an overlay (menu, dialog, listbox) was open when it was pressed.
  useEffect(() => {
    let overlayAtDown = false;
    const sel = '[role="dialog"],[role="menu"],[role="listbox"]';
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Escape') overlayAtDown = document.querySelector(sel) !== null; };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'Escape' && !overlayAtDown) api().hideWindow(); };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown, true); window.removeEventListener('keyup', onUp); };
  }, []);

  const submit = async () => {
    if (!projectId || busy) return;
    const body = text;
    if (mode === 'reply') {
      if (!threadId) return;
      setBusy(true);
      const r = await api().sendMessage(projectId, threadId, body);
      setBusy(false);
      if (r.ok) {
        setText((cur) => (cur === body ? '' : cur));
        push('success', 'Message sent');
        void refreshDetail();
      } else {
        push('error', toUiError(r).message);
      }
      return;
    }
    const threadTitle = title;
    setBusy(true);
    const r = await api().startThread(projectId, body, threadTitle || undefined);
    setBusy(false);
    if (r.ok) {
      setText((cur) => (cur === body ? '' : cur));
      setTitle((cur) => (cur === threadTitle ? '' : cur));
      push('success', 'Thread started');
      await refreshThreads();
      if (r.data.threadId && settings) {
        await update({ lastMode: 'reply', lastThreadByProject: { ...settings.lastThreadByProject, [projectId]: r.data.threadId } });
        setModeState('reply');
      }
    } else {
      push('error', toUiError(r).message);
    }
  };

  if (!state || !settings) {
    return (
      <div data-app-ready="true" className="flex h-full items-center justify-center bg-neutral-950/60 text-xs text-neutral-400">
        {stateError ? stateError.message : 'Loading…'}
      </div>
    );
  }

  const noProject = settings.projects.length === 0;
  const canReply = mode === 'reply' && threadId !== null;

  return (
    <Tooltip.Provider delay={400}>
      <div data-app-ready="true" className="relative flex h-full flex-col overflow-hidden bg-neutral-950/60 text-[13px] text-neutral-100">
        <Header
          state={state}
          health={health}
          checking={checking}
          onRetry={() => void check()}
          onPin={(p) => void api().setPinned(p)}
          onSave={update}
          onQuit={() => api().quitApp()}
        />
        <main className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
          <ProjectPicker
            projects={settings.projects}
            activeId={projectId}
            onSelect={(id) => void update({ activeProjectId: id })}
            onAdd={() => setAddOpen(true)}
            onRemove={(id) => void api().removeProject(id).then((r) => { if (!r.ok) push('error', toUiError(r).message); })}
            onOpenInApp={(id) => void api().openProjectInApp(id).then((r) => { if (!r.ok) push('error', toUiError(r).message); })}
          />
          {noProject ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-white/15 p-6 text-center">
              <p className="text-xs text-neutral-400">Add a folder that is already a T3 Code project to get started.</p>
              <button type="button" onClick={() => setAddOpen(true)} className="rounded-lg bg-accent/90 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-accent">
                Add project
              </button>
            </div>
          ) : (
            <>
              <ModeTabs mode={mode} onChange={setMode} />
              {threadsError && <p role="alert" className="rounded-md bg-danger/10 p-2 text-xs text-danger">{threadsError.message}</p>}
              {mode === 'reply' ? (
                <>
                  <ThreadSelect threads={visibleThreads} value={threadId} onChange={selectThread} loading={threadsLoading} />
                  <MessagePreview
                    detail={detail} loading={detailLoading} error={detailError}
                    onRefresh={() => void refreshDetail()}
                    onOpen={(link) => void api().openThread(link).then((r) => { if (!r.ok) push('error', toUiError(r).message); })}
                  />
                </>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col justify-end gap-2">
                  <NewThreadFields title={title} onTitle={setTitle} />
                </div>
              )}
              <Composer
                value={text}
                onChange={setText}
                onSubmit={() => void submit()}
                busy={busy}
                disabled={mode === 'reply' && !canReply}
                placeholder={mode === 'reply' ? 'Reply to this thread…' : 'What should the agent work on?'}
                submitLabel={mode === 'reply' ? 'Send' : 'Start'}
                focusKey={`${mode}:${projectId}:${threadId}`}
              />
            </>
          )}
        </main>
        <AddProjectDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onAdded={(id, name) => { void update({ activeProjectId: id }); push('success', `Added ${name}`); }}
        />
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </div>
    </Tooltip.Provider>
  );
}
