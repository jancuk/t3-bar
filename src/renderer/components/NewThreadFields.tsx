export function NewThreadFields({ title, onTitle }: { title: string; onTitle(v: string): void }) {
  return (
    <input
      value={title}
      onChange={(e) => onTitle(e.target.value)}
      maxLength={200}
      placeholder="Title (optional, defaults to the first line)"
      aria-label="Thread title"
      className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[13px] text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-accent/60"
    />
  );
}
