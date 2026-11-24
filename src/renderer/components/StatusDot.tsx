import { Tooltip } from '@base-ui/react/tooltip';
import type { Health } from '../../shared/types';
import { toneClass } from '../lib/format';

export function StatusDot({ health, checking, onRetry }: { health: Health | null; checking: boolean; onRetry(): void }) {
  const ok = health?.reachable === true;
  const tone = health === null ? toneClass.muted : ok ? toneClass.ok : toneClass.danger;
  const version = ok && health.serverVersion ? `v${health.serverVersion}` : null;
  const label = health === null || checking
    ? 'Checking T3 Code…'
    : ok
      ? `T3 Code connected${version ? ` · ${version}` : ''}`
      : 'T3 Code is not reachable. Click to retry.';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onRetry}
            className="inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[11px] text-[#71717a] outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            <span className={`size-1.5 rounded-full ${tone} ${checking ? 'animate-pulse' : ''}`} />
            {version}
            {health !== null && !ok && !checking && 'Offline'}
          </button>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} collisionPadding={8}>
          <Tooltip.Popup className="glass-popover rounded-md px-2 py-1 text-xs text-neutral-200">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
