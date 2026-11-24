import { Tooltip } from '@base-ui/react/tooltip';
import type { Health } from '../../shared/types';

export function ConnectionBadge({ health, checking, onRetry }: { health: Health | null; checking: boolean; onRetry(): void }) {
  const ok = health?.reachable === true;
  const label = !health ? 'Checking' : ok ? 'Connected' : 'Offline';
  const detail = !health
    ? 'Checking the T3 Code server'
    : ok
      ? `${health.label ?? 'T3 Code'}${health.serverVersion ? ` v${health.serverVersion}` : ''}\n${health.serverUrl}`
      : `${health.error ?? 'Not reachable'}. Click to retry.\n${health.serverUrl}`;
  const dot = !health || checking ? 'bg-warn animate-pulse' : ok ? 'bg-ok' : 'bg-danger';
  const button = (
    <button
      type="button"
      onClick={onRetry}
      className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-neutral-300 outline-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-accent [-webkit-app-region:no-drag]"
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </button>
  );
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={button} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} collisionPadding={8}>
          <Tooltip.Popup className="whitespace-pre-line rounded-md border border-white/10 bg-neutral-900/95 px-2 py-1 text-xs text-neutral-200 shadow-lg">
            {detail}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
