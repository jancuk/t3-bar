import { formatAccelerator } from '../../shared/accelerator';

export function ShortcutKeycap({ accelerator }: { accelerator: string }) {
  const keys = formatAccelerator(accelerator);
  return (
    <span
      aria-label={accelerator}
      className="inline-flex shrink-0 items-center gap-[3px] rounded-md border border-white/10 bg-white/[0.06] px-2 py-[3px] font-sans text-[11.5px] leading-[1.35] text-[#f4f4f5]"
    >
      {keys.map((k, i) => <span key={i}>{k}</span>)}
    </span>
  );
}
