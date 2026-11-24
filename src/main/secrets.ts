import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { validateAccessToken, validateEnvId } from '../shared/validation';
import { AppError } from './errors';

/** Wraps the OS keychain. Kept separate so this module never imports Electron. */
export interface CryptoAdapter {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

interface SecretsFile {
  version: 1;
  tokens: Record<string, string>;
}

const UNAVAILABLE = 'Secure storage (macOS Keychain) is unavailable, so the token was not saved.';

/** Access tokens, encrypted at rest. Tokens are never written in plaintext and never logged. */
export class SecretStore {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file: string;

  constructor(private readonly dir: string, private readonly crypto: CryptoAdapter) {
    this.file = path.join(dir, 'secrets.json');
  }

  isAvailable(): boolean {
    try {
      return this.crypto.isAvailable();
    } catch {
      return false;
    }
  }

  async get(envId: string): Promise<string | null> {
    return this.enqueue(async () => {
      const data = await this.read();
      const b64 = Object.prototype.hasOwnProperty.call(data.tokens, envId) ? data.tokens[envId] : undefined;
      if (typeof b64 !== 'string' || !this.isAvailable()) return null;
      try {
        return this.crypto.decrypt(Buffer.from(b64, 'base64'));
      } catch {
        return null;
      }
    });
  }

  async set(envId: string, token: string): Promise<void> {
    const id = validateEnvId(envId);
    if (!id.ok || envId === 'local') throw new AppError('VALIDATION_ERROR', 'Invalid machine id');
    const t = validateAccessToken(token);
    if (!t.ok) throw new AppError('VALIDATION_ERROR', t.message);
    if (!this.isAvailable()) throw new AppError('VALIDATION_ERROR', UNAVAILABLE);
    let cipher: Buffer;
    try {
      cipher = this.crypto.encrypt(t.value);
    } catch {
      throw new AppError('VALIDATION_ERROR', UNAVAILABLE);
    }
    await this.enqueue(async () => {
      const data = await this.read();
      data.tokens[envId] = cipher.toString('base64');
      await this.write(data);
    });
  }

  async delete(envId: string): Promise<void> {
    await this.enqueue(async () => {
      const data = await this.read();
      if (!Object.prototype.hasOwnProperty.call(data.tokens, envId)) return;
      delete data.tokens[envId];
      await this.write(data);
    });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read(): Promise<SecretsFile> {
    let text: string;
    try {
      text = await fs.readFile(this.file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, tokens: Object.create(null) as Record<string, string> };
      throw e;
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      const raw = typeof parsed === 'object' && parsed !== null ? (parsed as { tokens?: unknown }).tokens : null;
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('bad shape');
      const tokens = Object.create(null) as Record<string, string>;
      for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') tokens[k] = v;
      return { version: 1, tokens };
    } catch {
      await fs.rename(this.file, `${this.file}.bak-${Date.now()}`).catch(() => undefined);
      return { version: 1, tokens: Object.create(null) as Record<string, string> };
    }
  }

  private async write(data: SecretsFile): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    const body = JSON.stringify({ version: 1, tokens: { ...data.tokens } }, null, 2);
    try {
      await fs.writeFile(tmp, body, { mode: 0o600 });
      await fs.rename(tmp, this.file);
      await fs.chmod(this.file, 0o600);
    } catch (e) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw e;
    }
  }
}
