import { Tooltip } from '@base-ui/react/tooltip';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LOCAL_ENV_ID, NO_PROJECT_ID } from '../shared/types';
import { dirname, guessRemoteHome, tildify } from '../shared/targets';
import { MAX_MESSAGE_CHARS } from '../shared/validation';
import { ActionBar } from './components/ActionBar';
import { ContextBar } from './components/ContextBar';
import { EnvironmentMenu } from './components/EnvironmentMenu';
import { DestinationList, NEW_DEST } from './components/DestinationList';
import { PromptComposer } from './components/PromptComposer';
import { SentPill } from './components/SentPill';
import { TargetPalette } from './components/TargetPalette';
import { TargetPill } from './components/TargetPill';
import { ThreadPreview } from './components/ThreadPreview';
import { useAppState } from './hooks/useAppState';
import { useConnection } from './hooks/useConnection';
import { useCopy } from './hooks/useCopy';
import { useRemoteProjects } from './hooks/useRemoteProjects';
import { useFlash } from './hooks/useFlash';
import { useThreadDetail } from './hooks/useThreadDetail';
import { useThreads } from './hooks/useThreads';
import { useOnShown } from './hooks/useVisibility';
import { api, toUiError } from './lib/api';
import { truncate } from './lib/format';

const HIDE_AFTER_SEND_MS = 700;

export function App() {
  const { state, error: stateError, update } = useAppState();
  const settings = state?.settings;
  const envId = settings?.activeEnvironmentId ?? LOCAL_ENV_ID;
  const isRemote = envId !== LOCAL_ENV_ID;
  const remoteEnv = settings?.environments.find((e) => e.id === envId) ?? null;
  const remote = useRemoteProjects(envId);
  const { health, checking, check } = useConnection(envId, settings?.serverUrl);
  const copy = useCopy();

  // Local: the saved folder. Remote: the remembered project, else the machine's "No project", else its first project.
  const remoteTargetId = useMemo(() => {
    if (!isRemote || !remote.projects || !settings) return null;
    const saved = settings.activeTargetByEnv[envId];
    const list = remote.projects;
    return (
      list.find((p) => p.id === saved)?.id ??
      list.find((p) => p.isScratch)?.id ??
      list[0]?.id ??
      null
    );
  }, [isRemote, remote.projects, settings, envId]);
  const targetId = isRemote ? (remoteTargetId ?? '') : (settings?.activeProjectId ?? NO_PROJECT_ID);
  const targetReady = settings !== undefined && targetId !== '';
  const { threads, loading, error: threadsError, refresh: refreshThreads } = useThreads(envId, targetReady ? targetId : null);

  const [destination, setDestination] = useState<string>(NEW_DEST);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [envMenuOpen, setEnvMenuOpen] = useState(false);
  const paletteOpenRef = useRef(false);
  paletteOpenRef.current = paletteOpen;
  const envMenuOpenRef = useRef(false);
  envMenuOpenRef.current = envMenuOpen;
  const [pillLabel, setPillLabel] = useState('Sent to T3 Code');
  const [focusTick, setFocusTick] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const sent = useFlash(1400);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);
  useEffect(() => cancelHide, [cancelHide]);

  const showSettled = settings?.showSettled ?? false;
  const recent = useMemo(
    () =>
      threads
        .filter((t) => showSettled || (!t.settled && !t.archived))
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
        .slice(0, 20),
    [threads, showSettled],
  );
  const thread = recent.find((t) => t.threadId === destination) ?? null;
  const dest = thread ? thread.threadId : NEW_DEST;
  const ids = useMemo(() => [NEW_DEST, ...recent.map((t) => t.threadId)], [recent]);

  const { detail, loading: detailLoading, error: detailError, refresh: refreshDetail } = useThreadDetail(
    envId, thread && targetReady ? targetId : null, thread?.threadId ?? null, settings?.previewCount ?? 8,
  );

  const project = settings?.projects.find((p) => p.id === targetId) ?? null;
  const remoteProject = remote.projects?.find((p) => p.id === targetId) ?? null;
  const targetLabel = isRemote
    ? (remoteProject && !remoteProject.isScratch ? remoteProject.name : 'No project')
    : (project ? project.name : 'No project');
  const pillScratch = isRemote ? (remoteProject?.isScratch ?? true) : project === null;
  const remoteHome = guessRemoteHome((remote.projects ?? []).map((p) => p.path));
  const pillName = isRemote ? (remoteProject ? (remoteProject.isScratch ? 'No project' : remoteProject.name) : 'Loading…') : targetLabel;
  const pillSubtitle = isRemote
    ? (remoteProject && !remoteProject.isScratch ? tildify(dirname(remoteProject.path), remoteHome) : undefined)
    : (project ? tildify(dirname(project.path), state?.homeDir ?? '') : undefined);
  const focusComposer = useCallback(() => setFocusTick((n) => n + 1), []);
  const handleTextChange = useCallback((v: string) => {
    cancelHide();
    setError(null);
    setText(v);
  }, [cancelHide]);

  // Pinning or opening a popover cancels a pending auto-hide.
  useEffect(() => {
    if (paletteOpen || settingsOpen || envMenuOpen || settings?.pinned) cancelHide();
  }, [paletteOpen, settingsOpen, envMenuOpen, settings?.pinned, cancelHide]);

  // Switching machine or target always goes back to "New thread".
  useEffect(() => { setDestination(NEW_DEST); }, [envId, targetId]);

  // Remember the fallback project of a remote machine so it sticks.
  const savedRemoteTarget = settings?.activeTargetByEnv[envId];
  useEffect(() => {
    if (!isRemote || !remoteTargetId || savedRemoteTarget === remoteTargetId) return;
    void update({ activeTargetByEnv: { [envId]: remoteTargetId } });
  }, [isRemote, envId, remoteTargetId, savedRemoteTarget, update]);

  useOnShown(() => {
    cancelHide();
    sent.cancel();
    setError(null);
    setPaletteOpen(false);
    setSettingsOpen(false);
    setEnvMenuOpen(false);
    if (!settings?.pinned) setDestination(NEW_DEST);
    setAnimKey((n) => n + 1);
    focusComposer();
  });

  const move = useCallback((delta: 1 | -1) => {
    setDestination((cur) => {
      const i = Math.max(0, ids.indexOf(cur));
      return ids[Math.min(ids.length - 1, Math.max(0, i + delta))] ?? NEW_DEST;
    });
  }, [ids]);

  const open = useCallback(async (link: string | undefined) => {
    const r = link ? await api().openThread(link) : await api().openProjectInApp(envId, targetId);
    if (!r.ok) setError(toUiError(r).message);
  }, [envId, targetId]);

  const setEnvMenu = useCallback((next: boolean) => {
    setEnvMenuOpen(next);
    if (!next) focusComposer();
  }, [focusComposer]);

  const setPalette = useCallback((next: boolean) => {
    setPaletteOpen(next);
    if (!next) focusComposer();
  }, [focusComposer]);

  const showPill = useCallback((label: string) => {
    setPillLabel(label);
    sent.trigger();
  }, [sent]);

  const copyAnswer = useCallback(async () => {
    const msgs = detail && thread && detail.thread.threadId === thread.threadId ? detail.messages : [];
    const last = [...msgs].reverse().find((m) => m.role === 'assistant' && m.text.length > 0);
    if (!last) {
      setError(thread ? 'No answer to copy yet.' : 'Highlight a thread to copy its latest answer.');
      return;
    }
    const err = await copy(last.text);
    if (err) setError(err.message);
    else { setError(null); showPill('Copied answer'); }
  }, [detail, thread, copy, showPill]);

  const copyMessage = useCallback(async (text: string): Promise<boolean> => {
    const err = await copy(text);
    if (err) setError(err.message);
    return err === null;
  }, [copy]);

  // Global shortcuts: Cmd+K palette, Cmd+E machine menu, Cmd+N new thread, Cmd+O open, Cmd+Shift+C copy answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.repeat) return;
      if (e.shiftKey) {
        if (e.code === 'KeyC') {
          e.preventDefault();
          void copyAnswer();
        }
        return;
      }
      if (e.code === 'KeyE') {
        e.preventDefault();
        setEnvMenu(!envMenuOpenRef.current);
      } else if (e.code === 'KeyK') {
        e.preventDefault();
        setPalette(!paletteOpenRef.current);
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        setDestination(NEW_DEST);
        focusComposer();
      } else if (e.code === 'KeyO') {
        e.preventDefault();
        void open(thread?.link);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [thread, open, focusComposer, setPalette, setEnvMenu, copyAnswer]);

  // Esc closes an open overlay first; otherwise it hides the launcher.
  // Require a matching keydown inside this window so Esc from a native dialog never hides the launcher.
  useEffect(() => {
    let sawDown = false;
    let overlayAtDown = false;
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.isComposing || e.keyCode === 229 || e.repeat) {
        sawDown = false;
        return;
      }
      sawDown = true;
      overlayAtDown = document.querySelector('[data-overlay-open]') !== null;
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const shouldHide = sawDown && !overlayAtDown;
      sawDown = false;
      overlayAtDown = false;
      if (shouldHide) api().hideWindow();
    };
    const reset = () => { sawDown = false; overlayAtDown = false; };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', reset);
    };
  }, []);

  const canSend = text.trim().length > 0 && text.length <= MAX_MESSAGE_CHARS && !busy && targetId !== '';

  const submit = async () => {
    if (!canSend || !settings || !targetReady) return;
    const body = text;
    setBusy(true);
    setError(null);
    const r = thread
      ? await api().sendMessage(envId, targetId, thread.threadId, body)
      : await api().startThread(envId, targetId, body);
    setBusy(false);
    if (!r.ok) { setError(toUiError(r).message); return; }

    setText((cur) => (cur === body ? '' : cur));
    showPill('Sent to T3 Code');
    void refreshThreads();
    if (thread) void refreshDetail();
    else if (r.data.threadId) setDestination(r.data.threadId);
    if (settings.autoHideOnSend && !settings.pinned) {
      cancelHide();
      hideTimer.current = setTimeout(() => api().hideWindow(), HIDE_AFTER_SEND_MS);
    }
  };

  if (!state || !settings) {
    return (
      <div data-app-ready="true" className="flex h-full items-center justify-center bg-neutral-950/45 text-xs text-neutral-400">
        {stateError ? stateError.message : 'Loading…'}
      </div>
    );
  }

  const offline = health !== null && !health.reachable;
  const noProjectMissing = !isRemote && targetId === NO_PROJECT_ID && (state.noProject.available === false || threadsError?.code === 'PROJECT_NOT_FOUND');
  const showPreview = thread !== null;

  return (
    <Tooltip.Provider delay={400}>
      <div
        key={animKey}
        data-app-ready="true"
        className="launcher-in relative flex h-full flex-col overflow-hidden border-white/[0.06] bg-neutral-950/45 text-[13px] text-neutral-100"
      >
        <ContextBar
          state={state}
          health={health}
          checking={checking}
          envMenu={
            <EnvironmentMenu
              state={state}
              open={envMenuOpen}
              onOpenChange={setEnvMenu}
              onSelect={(id) => void update({ activeEnvironmentId: id }).then((e) => { if (e) setError(e.message); })}
            />
          }
          targetPalette={
            <TargetPalette
              state={state}
              remote={isRemote ? {
                envId,
                envLabel: remoteEnv?.label ?? 'machine',
                projects: remote.projects,
                loading: remote.loading,
                error: remote.error,
                refresh: remote.refresh,
              } : null}
              activeTargetId={targetId}
              open={paletteOpen}
              onOpenChange={setPalette}
              onSelect={(id) => void update(isRemote ? { activeTargetByEnv: { [envId]: id } } : { activeProjectId: id }).then((e) => { if (e) setError(e.message); })}
              trigger={<TargetPill name={pillName} subtitle={pillSubtitle} scratch={pillScratch} />}
            />
          }
          settingsOpen={settingsOpen}
          onSettingsOpenChange={(o) => { setSettingsOpen(o); if (!o) focusComposer(); }}
          onRetry={() => void check()}
          onPin={(p) => void api().setPinned(p)}
          onSave={update}
          onQuit={() => api().quitApp()}
        />
        <PromptComposer
          value={text}
          onChange={handleTextChange}
          onSubmit={() => void submit()}
          onNavigate={move}
          placeholder={thread ? `Reply to ${truncate(thread.title, 40)}…` : 'Ask T3 Code…'}
          focusKey={`${focusTick}:${targetId}`}
          activeDescendantId={`dest-${dest}`}
        />
        <div className="flex min-h-0 flex-1 border-t border-white/[0.06] pt-1">
          <DestinationList
            targetLabel={targetLabel}
            envLabel={isRemote ? (remoteEnv?.label ?? null) : null}
            authError={health?.authError ?? null}
            threads={recent}
            highlighted={dest}
            loading={loading}
            error={threadsError ?? (isRemote ? remote.error : null)}
            offline={offline}
            noProjectMissing={noProjectMissing}
            compact={showPreview}
            onHighlight={setDestination}
            onChoose={focusComposer}
            onOpen={(link) => void open(link)}
          />
          {thread && (
            <ThreadPreview
              threadId={thread.threadId}
              detail={detail}
              loading={detailLoading}
              error={detailError}
              onRefresh={() => void refreshDetail()}
              onOpen={(link) => void open(link)}
              onCopy={copyMessage}
            />
          )}
        </div>
        <ActionBar
          error={error}
          label={thread ? 'Send reply' : 'Start thread'}
          busy={busy}
          canSend={canSend}
          onSend={() => void submit()}
        />
        <SentPill show={sent.on} label={pillLabel} />
      </div>
    </Tooltip.Provider>
  );
}
