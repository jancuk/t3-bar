export function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}

export type Tone = 'ok' | 'warn' | 'danger' | 'muted' | 'accent';

export function statusTone(status: string): Tone {
  switch (status) {
    case 'running': case 'working': return 'accent';
    case 'waiting': case 'needs-input': return 'warn';
    case 'error': case 'failed': return 'danger';
    case 'idle': case 'ready': case 'completed': return 'ok';
    default: return 'muted';
  }
}

export const toneClass: Record<Tone, string> = {
  ok: 'bg-[#34d399] shadow-[0_0_8px_rgba(52,211,153,0.7)]',
  warn: 'bg-[#fbbf24] shadow-[0_0_8px_rgba(251,191,36,0.45)]',
  danger: 'bg-[#f87171] shadow-[0_0_8px_rgba(248,113,113,0.5)]',
  accent: 'bg-[#fafafa] shadow-[0_0_8px_rgba(255,255,255,0.45)]',
  muted: 'bg-neutral-500',
};

export function roleLabel(role: string): string {
  if (role === 'user') return 'You';
  if (role === 'assistant') return 'Agent';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Compact age for thread rows: now, 2m, 14m, 15h, 3d, then a short date. */
export function shortRelativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const date = new Date(t);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
