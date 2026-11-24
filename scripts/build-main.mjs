import { build, context } from 'esbuild';
import { rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

const entries = [
  { entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs' },
  { entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs' },
];

if (watch) {
  const ctxs = await Promise.all(entries.map((e) => context({ ...common, ...e })));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('[build-main] watching...');
} else {
  rmSync('dist/main', { recursive: true, force: true });
  rmSync('dist/preload', { recursive: true, force: true });
  await Promise.all(entries.map((e) => build({ ...common, ...e })));
}
