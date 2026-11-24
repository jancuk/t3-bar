import type { Health, SavedProject, SendResult, StartResult, ThreadDetail, ThreadSummary } from '../shared/types';
import type { T3Client } from './t3cli';

export const DEMO_HOME = '/Users/demo';
export const DEMO_CLIPBOARD_TEXT = 'npm run build && git push origin feature/checkout-fix';

export const DEMO_PROJECTS: SavedProject[] = [
  { id: 'demo-acme-web', name: 'acme-web', path: '/Users/demo/code/acme-web' },
  { id: 'demo-acme-api', name: 'acme-api', path: '/Users/demo/code/acme-api' },
  { id: 'demo-notes', name: 'notes', path: '/Users/demo/writing/notes' },
];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

interface DemoThread {
  id: string;
  title: string;
  status: string;
  model: string;
  provider: string;
  ageMs: number;
}

const THREADS: DemoThread[] = [
  { id: 'demo-t1', title: 'Fix checkout total rounding', status: 'running', model: 'sonnet-5.5', provider: 'claudeAgent', ageMs: 2 * MIN },
  { id: 'demo-t2', title: 'Add pagination to the orders table', status: 'waiting', model: 'sonnet-5.5', provider: 'claudeAgent', ageMs: 14 * MIN },
  { id: 'demo-t3', title: 'Write release notes for 2.4', status: 'idle', model: 'gpt-5.5', provider: 'codex', ageMs: 15 * HOUR },
  { id: 'demo-t4', title: 'Refactor the settings form', status: 'idle', model: 'opus-5.5', provider: 'claudeAgent', ageMs: 15 * HOUR + 20 * MIN },
  { id: 'demo-t5', title: 'Investigate flaky signup test', status: 'error', model: 'gpt-5.5', provider: 'codex', ageMs: 2 * DAY },
  { id: 'demo-t6', title: 'Update dependencies', status: 'idle', model: 'sonnet-5.5', provider: 'claudeAgent', ageMs: 2 * DAY + 3 * HOUR },
];

const ANSWER = `The rounding bug comes from summing **already rounded** line totals. Round once, at the end.

- **Fix:** \`calcTotal\` now sums cents as integers
- **Tax:** applied to the subtotal, not per line
- **Test:** added a regression case for \`$19.99 x 3\``;

export function demoHealth(): Health {
  return { reachable: true, serverUrl: 'http://127.0.0.1:3773', serverVersion: '0.1.11', platform: 'darwin arm64', checkedAt: Date.now() };
}

function summary(t: DemoThread, now: number): ThreadSummary {
  return {
    threadId: t.id,
    title: t.title,
    status: t.status,
    model: t.model,
    provider: t.provider,
    link: `https://example.com/threads/${t.id}`,
    updatedAt: new Date(now - t.ageMs).toISOString(),
    createdAt: new Date(now - t.ageMs - HOUR).toISOString(),
    pinned: false,
    settled: false,
    archived: false,
  };
}

export function createFixtureClient(now: () => number = Date.now): T3Client {
  const detail = (threadId: string): ThreadDetail => {
    const t = THREADS.find((x) => x.id === threadId) ?? THREADS[0]!;
    const base = now() - t.ageMs;
    return {
      thread: summary(t, now()),
      pendingRequestCount: 0,
      messages: [
        { role: 'user', text: 'Why is the order total off by a cent on some carts?', createdAt: new Date(base - 8 * MIN).toISOString() },
        { role: 'assistant', text: ANSWER, createdAt: new Date(base).toISOString() },
      ],
    };
  };
  return {
    async listThreads() {
      return THREADS.map((t) => summary(t, now()));
    },
    async showThread(threadId) {
      return detail(threadId);
    },
    async sendMessage(): Promise<SendResult> {
      return {};
    },
    async startThread(): Promise<StartResult> {
      return {};
    },
    async openApp() {},
  };
}
