import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

for (const f of ['dist/main/index.cjs', 'dist/preload/index.cjs', 'dist/preload/pill.cjs', 'dist/renderer/index.html', 'dist/renderer/pill.html']) {
  if (!existsSync(f)) {
    console.error(`Missing ${f}. Run "npm run build" first.`);
    process.exit(1);
  }
}

const outDir = resolve('docs');
mkdirSync(outDir, { recursive: true });

const userData = mkdtempSync(join(tmpdir(), 't3-bar-capture-'));
const env = { ...process.env, T3_BAR_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const child = spawn(electronPath, ['.', '--capture-screenshots', `--capture-out=${outDir}`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
child.stderr.on('data', (d) => { out += d; });

const timer = setTimeout(() => {
  console.error('Screenshot capture timed out after 45s');
  child.kill('SIGKILL');
}, 45_000);

child.on('close', (code) => {
  clearTimeout(timer);
  rmSync(userData, { recursive: true, force: true });
  if (code === 0 && out.includes('CAPTURE_OK')) {
    console.log(`Screenshots written to ${outDir}`);
    process.exit(0);
  }
  console.error(`Screenshot capture failed (exit ${code})`);
  console.error(out.split('\n').slice(-30).join('\n'));
  process.exit(1);
});
