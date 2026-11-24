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
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  accent: 'bg-accent',
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
