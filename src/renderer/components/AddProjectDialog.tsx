import { Dialog } from '@base-ui/react/dialog';
import { FolderOpen, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { api, toUiError } from '../lib/api';

export function AddProjectDialog({
  open, onOpenChange, onAdded,
}: { open: boolean; onOpenChange(o: boolean): void; onAdded(id: string, name: string): void }) {
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (o: boolean) => {
    if (!o) { setPath(''); setError(null); setBusy(false); }
    onOpenChange(o);
  };

  const browse = async () => {
    const r = await api().pickFolder();
    if (r.ok && r.data) setPath(r.data);
    else if (!r.ok) setError(toUiError(r).message);
  };

  const add = async () => {
    setBusy(true);
    setError(null);
    const r = await api().addProject(path.trim());
    setBusy(false);
    if (r.ok) { onAdded(r.data.id, r.data.name); reset(false); } else setError(toUiError(r).message);
  };

  return (
    <Dialog.Root open={open} onOpenChange={reset}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-neutral-900/95 p-4 text-neutral-100 shadow-2xl outline-none backdrop-blur-xl">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-sm font-semibold">Add project</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-neutral-400">
                Choose a folder that is already a T3 Code project.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close" className="rounded-md p-1 text-neutral-400 hover:bg-white/10"><X className="size-4" /></Dialog.Close>
          </div>
          <div className="flex gap-2">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/you/code/project"
              aria-label="Project folder"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-xs outline-none placeholder:text-neutral-500 focus:border-accent/60"
            />
            <button type="button" onClick={() => void browse()} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 text-xs hover:bg-white/10">
              <FolderOpen className="size-3.5" />Browse
            </button>
          </div>
          {error && <p role="alert" className="selectable mt-2 text-xs text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10">Cancel</Dialog.Close>
            <button
              type="button"
              disabled={busy || !path.trim()}
              onClick={() => void add()}
              className="flex items-center gap-1.5 rounded-lg bg-accent/90 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-accent disabled:opacity-40"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}Add
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
