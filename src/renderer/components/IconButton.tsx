import { Tooltip } from '@base-ui/react/tooltip';
import type { ComponentProps, ReactNode } from 'react';

interface Props extends Omit<ComponentProps<'button'>, 'children'> {
  label: string;
  children: ReactNode;
  tooltip?: boolean;
}

export const iconBtnClass =
  'inline-flex size-[26px] items-center justify-center rounded-[7px] text-[#71717a] outline-none transition-all duration-[120ms] ' +
  'hover:bg-white/[0.08] hover:text-[#f4f4f5] focus-visible:ring-1 focus-visible:ring-white/40 disabled:opacity-40 ' +
  'data-[pressed]:bg-white/[0.08] data-[pressed]:text-[#f4f4f5] data-[popup-open]:bg-white/10 data-[popup-open]:text-[#fafafa] ' +
  '[-webkit-app-region:no-drag]';

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
          <Tooltip.Popup className="glass-popover rounded-md px-2 py-1 text-xs text-neutral-200">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
