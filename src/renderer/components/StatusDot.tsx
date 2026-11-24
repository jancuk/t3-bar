import { Tooltip } from '@base-ui/react/tooltip';
import type { Health } from '../../shared/types';

export function StatusDot({ health, checking, onRetry }: { health: Health | null; checking: boolean; onRetry(): void }) {
  const ok = health?.reachable === true;
  const authError = health?.authError;
  const name = health?.kind === 'remote' && health.envLabel ? health.envLabel : 'T3 Code';
  const tone = health === null ? 'bg-neutral-500' : authError ? 'bg-warn' : ok ? 'bg-ok' : 'bg-danger';
  const label = health === null || checking
    ? `Checking ${name}…`
    : authError
      ? `${name}: ${authError}`
      : ok
        ? `${name} connected${health.serverVersion ? ` · v${health.serverVersion}` : ''}`
        : `${name} is not reachable. Click to retry.`;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <button type="button" aria-label={label} onClick={onRetry} className="flex size-7 items-center justify-center rounded-md outline-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-accent">
            <span className={`size-1.5 rounded-full ${tone} ${checking ? 'animate-pulse' : ''}`} />
          </button>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} collisionPadding={8}>
          <Tooltip.Popup className="rounded-md border border-white/10 bg-neutral-900/95 px-2 py-1 text-xs text-neutral-200 shadow-lg">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
