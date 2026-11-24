import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sanitizeSettings } from './settings';

export interface LegacyMigrationInput {
  userDataDir: string;
  appDataDir: string;
  env?: NodeJS.ProcessEnv;
}

/** Copies settings (only) from the old "t3-widget" profile into a fresh T3 Bar profile. Never touches the old directory. */
export async function migrateLegacySettings(input: LegacyMigrationInput): Promise<boolean> {
  const env = input.env ?? process.env;
  if (env.T3_BAR_USER_DATA) return false;
  const target = path.join(input.userDataDir, 'settings.json');
  const source = path.join(input.appDataDir, 't3-widget', 'settings.json');
  if (path.resolve(path.dirname(source)) === path.resolve(input.userDataDir)) return false;
  const exists = await fs.stat(target).then(() => true, () => false);
  if (exists) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(source, 'utf8'));
  } catch {
    return false;
  }
  const clean = { ...sanitizeSettings(parsed), clipboardCapture: false, clipboardConsent: false };
  await fs.mkdir(input.userDataDir, { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(clean, null, 2), { mode: 0o600 });
  await fs.rename(tmp, target);
  return true;
}
