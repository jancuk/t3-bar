import { Tooltip } from '@base-ui/react/tooltip';
import type { ComponentProps, ReactNode } from 'react';

interface Props extends Omit<ComponentProps<'button'>, 'children'> {
  label: string;
  children: ReactNode;
  tooltip?: boolean;
}

export const iconBtnClass =
  'inline-flex size-7 items-center justify-center rounded-md text-neutral-400 outline-none transition-colors ' +
  'hover:bg-white/10 hover:text-neutral-100 focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-40 ' +
  'data-[pressed]:bg-white/15 data-[pressed]:text-neutral-100 [-webkit-app-region:no-drag]';

export function IconButton({ label, children, className = '', tooltip = true, ...rest }: Props) {
  const button = (
    <button type="button" aria-label={label} className={`${iconBtnClass} ${className}`} {...rest}>
      {children}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={button} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} collisionPadding={8}>
          <Tooltip.Popup className="rounded-md border border-white/10 bg-neutral-900/95 px-2 py-1 text-xs text-neutral-200 shadow-lg">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
