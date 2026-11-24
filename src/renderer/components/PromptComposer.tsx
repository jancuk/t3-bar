import { useEffect, useLayoutEffect, useRef } from 'react';
import { MAX_MESSAGE_CHARS } from '../../shared/validation';

const MAX_HEIGHT = 6 * 22;

export function PromptComposer({
  value, onChange, onSubmit, onNavigate, placeholder, focusKey, activeDescendantId,
}: {
  value: string;
  onChange(v: string): void;
  onSubmit(): void;
  /** Move the highlighted destination by one row. */
  onNavigate(delta: 1 | -1): void;
  placeholder: string;
  focusKey: unknown;
  activeDescendantId?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, [focusKey]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  return (
    <div className="px-4 pb-3 pt-3.5">
      <textarea
        ref={ref}
        data-launcher-input="true"
        value={value}
        rows={1}
        maxLength={MAX_MESSAGE_CHARS + 1}
        placeholder={placeholder}
        aria-label="Message"
        aria-controls="destination-list"
        aria-activedescendant={activeDescendantId}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === 'Enter') {
            if (e.shiftKey && !e.metaKey) return; // newline
            e.preventDefault();
            onSubmit();
            return;
          }
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.altKey) {
            if (e.metaKey || !value.includes('\n')) {
              e.preventDefault();
              onNavigate(e.key === 'ArrowUp' ? -1 : 1);
            }
          }
        }}
        className="block w-full resize-none overflow-y-auto bg-transparent text-[15px] leading-[22px] text-neutral-50 caret-accent outline-none placeholder:text-neutral-500"
      />
    </div>
  );
}
