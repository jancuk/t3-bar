import { createHash } from 'node:crypto';
import path from 'node:path';

/** `$T3CODE_HOME` when it is a clean absolute path, else `~/.t3`. */
export function resolveT3Home(env: NodeJS.ProcessEnv, homedir: string): string {
  const v = env.T3CODE_HOME;
  if (typeof v === 'string' && v.length > 0 && !v.includes('\0') && path.isAbsolute(v)) return v;
  return path.join(homedir, '.t3');
}

/** Where T3 Code keeps its "No project" threads. */
export function scratchDir(t3Home: string): string {
  return path.join(t3Home, 'scratch');
}

export function projectIdFor(p: string): string {
  return `p-${createHash('sha1').update(p).digest('hex').slice(0, 10)}`;
}
