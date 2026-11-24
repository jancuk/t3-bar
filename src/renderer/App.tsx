import { Tooltip } from '@base-ui/react/tooltip';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NO_PROJECT_ID } from '../shared/types';
import { MAX_MESSAGE_CHARS } from '../shared/validation';
import { ActionBar } from './components/ActionBar';
import { ContextBar } from './components/ContextBar';
import { DestinationList, NEW_DEST } from './components/DestinationList';
import { PromptComposer } from './components/PromptComposer';
import { SentPill } from './components/SentPill';
import { ThreadPreview } from './components/ThreadPreview';
import { useAppState } from './hooks/useAppState';
import { useConnection } from './hooks/useConnection';
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
  const targetId = settings?.activeProjectId ?? NO_PROJECT_ID;
  const { health, checking, check } = useConnection(settings?.serverUrl);
  const { threads, loading, error: threadsError, refresh: refreshThreads } = useThreads(settings ? targetId : null);

  const [destination, setDestination] = useState<string>(NEW_DEST);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const paletteOpenRef = useRef(false);
  paletteOpenRef.current = paletteOpen;
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
    thread ? targetId : null, thread?.threadId ?? null, settings?.previewCount ?? 8,
  );

  const project = settings?.projects.find((p) => p.id === targetId) ?? null;
  const targetLabel = project ? project.name : 'No project';
  const focusComposer = useCallback(() => setFocusTick((n) => n + 1), []);
  const handleTextChange = useCallback((v: string) => {
    cancelHide();
    setError(null);
    setText(v);
  }, [cancelHide]);

  // Pinning or opening a popover cancels a pending auto-hide.
  useEffect(() => {
    if (paletteOpen || settingsOpen || settings?.pinned) cancelHide();
  }, [paletteOpen, settingsOpen, settings?.pinned, cancelHide]);

  // Switching target always goes back to "New thread".
  useEffect(() => { setDestination(NEW_DEST); }, [targetId]);

  useOnShown(() => {
    cancelHide();
    sent.cancel();
    setError(null);
    setPaletteOpen(false);
    setSettingsOpen(false);
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
    const r = link ? await api().openThread(link) : await api().openProjectInApp(targetId);
    if (!r.ok) setError(toUiError(r).message);
  }, [targetId]);

  const setPalette = useCallback((next: boolean) => {
    setPaletteOpen(next);
    if (!next) focusComposer();
  }, [focusComposer]);

  // Global shortcuts: Cmd+K palette, Cmd+N new thread, Cmd+O open in T3 Code.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.shiftKey || e.altKey || e.repeat) return;
      if (e.code === 'KeyK') {
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
  }, [thread, open, focusComposer, setPalette]);

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

  const canSend = text.trim().length > 0 && text.length <= MAX_MESSAGE_CHARS && !busy;

  const submit = async () => {
    if (!canSend || !settings) return;
    const body = text;
    setBusy(true);
    setError(null);
    const r = thread
      ? await api().sendMessage(targetId, thread.threadId, body)
      : await api().startThread(targetId, body);
    setBusy(false);
    if (!r.ok) { setError(toUiError(r).message); return; }

    setText((cur) => (cur === body ? '' : cur));
    sent.trigger();
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
  const noProjectMissing = targetId === NO_PROJECT_ID && (state.noProject.available === false || threadsError?.code === 'PROJECT_NOT_FOUND');
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
          project={project}
          health={health}
          checking={checking}
          paletteOpen={paletteOpen}
          onPaletteOpenChange={setPalette}
          settingsOpen={settingsOpen}
          onSettingsOpenChange={(o) => { setSettingsOpen(o); if (!o) focusComposer(); }}
          onSelectTarget={(id) => void update({ activeProjectId: id }).then((e) => { if (e) setError(e.message); })}
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
            threads={recent}
            highlighted={dest}
            loading={loading}
            error={threadsError}
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
        <SentPill show={sent.on} />
      </div>
    </Tooltip.Provider>
  );
}
