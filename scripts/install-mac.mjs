// Build T3 Bar and install it to /Applications, replacing a running copy.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const arch = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
const built = `release/${arch}/T3 Bar.app`;
const target = '/Applications/T3 Bar.app';

run('npm', ['run', 'dist:mac']);
if (!existsSync(built)) throw new Error(`build output missing: ${built}`);

const isRunning = () =>
  execFileSync('osascript', ['-e', 'application "T3 Bar" is running'], { encoding: 'utf8' }).trim() === 'true';

if (isRunning()) {
  execFileSync('osascript', ['-e', 'tell application "T3 Bar" to quit']);
  // The single-instance lock would make the new copy exit if the old one is still shutting down.
  for (let i = 0; i < 50 && isRunning(); i++) execFileSync('sleep', ['0.1']);
  if (isRunning()) throw new Error('T3 Bar did not quit; quit it from the menu bar and rerun.');
}

run('rm', ['-rf', target]);
run('ditto', [built, target]);
run('codesign', ['--verify', '--deep', '--strict', target]);
run('open', [target]);
console.log(`Installed and launched ${target}`);
