import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { watch, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { context } from 'esbuild';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const DEV_URL = 'http://127.0.0.1:5173';
const DEV_USER_DATA = path.join(os.homedir(), 'Library', 'Application Support', 't3-bar-dev');

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();

const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'], sourcemap: true, logLevel: 'info' };
const ctxs = await Promise.all([
  context({ ...common, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs' }),
  context({ ...common, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs' }),
  context({ ...common, entryPoints: ['src/preload/pill.ts'], outfile: 'dist/preload/pill.cjs' }),
]);
await Promise.all(ctxs.map((c) => c.rebuild()));
await Promise.all(ctxs.map((c) => c.watch()));

let child = null;
let restarting = false;
let quitting = false;

function start() {
  const env = {
    ...process.env,
    VITE_DEV_SERVER_URL: DEV_URL,
    T3_BAR_USER_DATA: process.env.T3_BAR_USER_DATA || DEV_USER_DATA,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electronPath, ['.'], { env, stdio: 'inherit' });
  child.on('exit', () => {
    child = null;
    if (restarting) { restarting = false; start(); }
    else if (!quitting) shutdown();
  });
}

let timer = null;
function scheduleRestart() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (child) { restarting = true; child.kill('SIGTERM'); } else start();
  }, 250);
}

for (const f of ['dist/main/index.cjs', 'dist/preload/index.cjs', 'dist/preload/pill.cjs']) {
  if (existsSync(f)) watch(f, scheduleRestart);
}

async function shutdown() {
  quitting = true;
  if (child) child.kill('SIGTERM');
  await Promise.all(ctxs.map((c) => c.dispose()));
  await server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
