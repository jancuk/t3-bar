import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

for (const f of ['dist/main/index.cjs', 'dist/preload/index.cjs', 'dist/renderer/index.html']) {
  if (!existsSync(f)) {
    console.error(`Missing ${f}. Run "npm run build" first.`);
    process.exit(1);
  }
}

const userData = mkdtempSync(join(tmpdir(), 't3-widget-smoke-'));
const env = { ...process.env, T3_WIDGET_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.', '--smoke-test'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
child.stderr.on('data', (d) => { out += d; });

const timer = setTimeout(() => {
  console.error('Smoke test timed out after 30s');
  child.kill('SIGKILL');
}, 30_000);

child.on('close', (code) => {
  clearTimeout(timer);
  rmSync(userData, { recursive: true, force: true });
  if (code === 0 && out.includes('SMOKE_OK')) {
    console.log('Smoke test passed');
    process.exit(0);
  }
  console.error(`Smoke test failed (exit ${code})`);
  console.error(out.split('\n').slice(-30).join('\n'));
  process.exit(1);
});
