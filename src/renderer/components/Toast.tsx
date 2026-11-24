import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastItem } from '../hooks/useToast';

const icons = {
  success: <CheckCircle2 className="size-4 text-ok" />,
  error: <AlertCircle className="size-4 text-danger" />,
  info: <Info className="size-4 text-accent" />,
};

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss(id: number): void }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-3 bottom-3 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex items-start gap-2 rounded-lg border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs text-neutral-100 shadow-xl"
        >
          <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
          <span className="selectable min-w-0 flex-1 break-words">{t.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => onDismiss(t.id)} className="text-neutral-500 hover:text-neutral-200">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
