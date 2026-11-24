import { useEffect, useLayoutEffect, useRef } from 'react';
import { MAX_MESSAGE_CHARS } from '../../shared/validation';

const LINE_HEIGHT = 16.5 * 1.4;
const MAX_HEIGHT = Math.round(LINE_HEIGHT * 5);

export function PromptComposer({
  value, onChange, onSubmit, onNavigate, placeholder, focusKey, caretEndKey, activeDescendantId,
}: {
  value: string;
  onChange(v: string): void;
  onSubmit(): void;
  /** Move the highlighted destination by one row. */
  onNavigate(delta: 1 | -1): void;
  placeholder: string;
  focusKey: unknown;
  /** Changing this puts the caret at the end of the text (used after a clipboard prefill). */
  caretEndKey: number;
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
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caretEndKey === 0) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollTop = el.scrollHeight;
  }, [caretEndKey]);

  return (
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
      className="block w-full resize-none overflow-y-auto border-0 bg-transparent p-0 text-[16.5px] font-normal leading-[1.4] tracking-[-0.018em] text-[#fafafa] caret-[#fafafa] outline-none placeholder:text-[#52525b]"
    />
  );
}
