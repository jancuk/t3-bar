import { ArrowLeft, Check, Copy, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RemoteEnvironmentSummary } from '../../shared/types';
import { validateRemoteOrigin } from '../../shared/validation';
import { useCopy } from '../hooks/useCopy';
import { api, toUiError } from '../lib/api';

export const TOKEN_COMMAND =
  't3 auth session issue --scope orchestration:read --scope orchestration:operate --label "T3 Launcher" --token-only';

const field =
  'w-full rounded-md border border-white/10 bg-white/[0.05] px-2 py-1.5 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-accent/60';

/** `mode: 'add'` creates a machine. `mode: 'token'` replaces the token of a saved one. */
export function AddEnvironmentForm({
  env, secretsAvailable, onBack, onDone,
}: {
  env: RemoteEnvironmentSummary | null;
  secretsAvailable: boolean;
  onBack(): void;
  onDone(): void;
}) {
  const copy = useCopy();
  const [origin, setOrigin] = useState(env?.origin ?? '');
  const [originError, setOriginError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const checkOrigin = (v: string): string | null => {
    const r = validateRemoteOrigin(v);
    return r.ok ? null : r.message;
  };

  const copyCommand = async () => {
    if ((await copy(TOKEN_COMMAND)) !== null) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  const submit = async () => {
    if (busy) return;
    const oe = env ? null : checkOrigin(origin);
    setOriginError(oe);
    if (oe) return;
    if (token.trim().length === 0) {
      setError('Paste the access token first.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = env
      ? await api().updateEnvironmentToken(env.id, token.trim())
      : await api().addEnvironment({ origin: origin.trim(), token: token.trim(), label: label.trim() || undefined });
    setBusy(false);
    if (!r.ok) {
      setError(toUiError(r).message);
      return;
    }
    setToken('');
    onDone();
  };

  const verb = env ? 'Test & Save' : 'Test & Add';
  return (
    <form
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <button type="button" aria-label="Back" onClick={onBack} className="flex size-6 items-center justify-center rounded text-neutral-400 hover:bg-white/10 hover:text-neutral-100">
          <ArrowLeft className="size-3.5" />
        </button>
        <h2 className="text-sm font-semibold">{env ? `Update token for ${env.label}` : 'Add remote machine'}</h2>
      </div>

      {!env && (
        <label className="mb-2.5 block text-[11px] text-neutral-400">Address
          <input
            ref={firstField}
            className={`${field} mt-1 font-mono`}
            value={origin}
            placeholder="https://my-mac.tailnet.ts.net"
            spellCheck={false}
            autoCapitalize="off"
            onChange={(e) => { setOrigin(e.target.value); if (originError) setOriginError(null); }}
            onBlur={() => setOriginError(origin.trim() ? checkOrigin(origin) : null)}
          />
          {originError && <span role="alert" className="mt-1 block text-[11px] text-danger">{originError}</span>}
        </label>
      )}

      <div className="mb-2.5 text-[11px] text-neutral-400">
        On that machine, run:
        <div className="mt-1 flex items-start gap-1.5 rounded-md border border-white/10 bg-black/30 p-1.5">
          <code className="selectable min-w-0 flex-1 break-words font-mono text-[10.5px] leading-snug text-neutral-300">{TOKEN_COMMAND}</code>
          <button type="button" aria-label="Copy command" title="Copy command" onClick={() => void copyCommand()} className={`flex size-5 shrink-0 items-center justify-center rounded hover:bg-white/10 ${copied ? 'text-ok' : 'text-neutral-400 hover:text-neutral-100'}`}>
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </button>
        </div>
      </div>

      <label className="mb-2.5 block text-[11px] text-neutral-400">Access token
        <input
          ref={env ? firstField : undefined}
          className={`${field} mt-1 font-mono`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          placeholder="Paste the printed token"
          onChange={(e) => setToken(e.target.value)}
        />
      </label>

      {!env && (
        <label className="mb-2.5 block text-[11px] text-neutral-400">Name (optional)
          <input className={`${field} mt-1`} value={label} maxLength={60} placeholder="Defaults to the machine's own name" onChange={(e) => setLabel(e.target.value)} />
        </label>
      )}

      {!secretsAvailable && (
        <p role="alert" className="mb-2 text-[11px] leading-snug text-warn">
          Secure storage (macOS Keychain) is unavailable, so tokens cannot be saved.
        </p>
      )}
      {error && <p role="alert" className="selectable mb-2 text-xs leading-snug text-danger">{error}</p>}

      <button
        type="submit"
        disabled={busy || !secretsAvailable}
        className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-accent/90 text-xs font-medium text-neutral-950 hover:bg-accent disabled:opacity-50"
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        {busy ? 'Testing…' : verb}
      </button>
    </form>
  );
}
