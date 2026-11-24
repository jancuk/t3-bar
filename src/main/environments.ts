import { LOCAL_ENV_ID, MAX_ENVIRONMENTS, type AddEnvironmentInput, type RemoteEnvironmentSummary } from '../shared/types';
import { validateAccessToken, validateEnvId, validateEnvLabel, validateRemoteOrigin } from '../shared/validation';
import { AppError } from './errors';
import { probeEnvironment } from './health';
import { envIdFor } from './paths';
import { createRemoteClient, type RemoteClient, type RemoteDeps } from './remote';
import type { SecretStore } from './secrets';
import type { SettingsStore } from './settings';

export interface EnvironmentManager {
  /** The (memoized) client for a saved machine. */
  get(envId: string): RemoteClient;
  add(input: AddEnvironmentInput): Promise<RemoteEnvironmentSummary>;
  updateToken(envId: string, token: string): Promise<void>;
  remove(envId: string): Promise<void>;
}

type ClientDeps = Omit<RemoteDeps, 'getToken'>;

export function createEnvironmentManager(opts: {
  store: SettingsStore;
  secrets: SecretStore;
  clientDeps?: ClientDeps;
}): EnvironmentManager {
  const { store, secrets } = opts;
  const clientDeps = opts.clientDeps ?? {};
  const clients = new Map<string, RemoteClient>();

  const saved = (envId: string): RemoteEnvironmentSummary | undefined =>
    store.get().environments.find((e) => e.id === envId);

  const unwrap = <T>(v: { ok: true; value: T } | { ok: false; message: string }): T => {
    if (!v.ok) throw new AppError('VALIDATION_ERROR', v.message);
    return v.value;
  };

  /** Throws unless the machine answers and accepts the token. Uses an in-memory token only. */
  const verify = async (env: RemoteEnvironmentSummary, token: string) => {
    const probe = await probeEnvironment(env.origin, clientDeps.fetchImpl);
    if (!probe.reachable) throw new AppError('SERVER_UNREACHABLE', `Cannot reach ${env.origin}. Check the address and that T3 Code is running there.`);
    const tmp = createRemoteClient(env, { ...clientDeps, getToken: async () => token });
    await tmp.fetchShell({ force: true });
    return probe;
  };

  return {
    get(envId) {
      const id = unwrap(validateEnvId(envId));
      if (id === LOCAL_ENV_ID) throw new AppError('VALIDATION_ERROR', 'Not a remote machine');
      const env = saved(id);
      if (!env) throw new AppError('VALIDATION_ERROR', 'That machine is not saved any more.');
      let c = clients.get(id);
      if (!c || c.env.origin !== env.origin) {
        c = createRemoteClient(env, { ...clientDeps, getToken: () => secrets.get(id) });
        clients.set(id, c);
      }
      return c;
    },

    async add(input) {
      const origin = unwrap(validateRemoteOrigin(input.origin));
      const token = unwrap(validateAccessToken(input.token));
      const label = unwrap(validateEnvLabel(input.label));
      if (!secrets.isAvailable()) {
        throw new AppError('VALIDATION_ERROR', 'Secure storage (macOS Keychain) is unavailable, so the token was not saved.');
      }
      const id = envIdFor(origin);
      const existing = saved(id);
      if (!existing && store.get().environments.length >= MAX_ENVIRONMENTS) {
        throw new AppError('VALIDATION_ERROR', `Machine limit reached (${MAX_ENVIRONMENTS} max)`);
      }
      const draft: RemoteEnvironmentSummary = { id, label: label ?? existing?.label ?? new URL(origin).hostname, origin };
      const probe = await verify(draft, token);
      const probeLabel = validateEnvLabel(probe.label);
      const env: RemoteEnvironmentSummary = {
        id,
        label: label ?? (probeLabel.ok ? probeLabel.value : undefined) ?? draft.label,
        origin,
        ...(probe.environmentId ? { environmentId: probe.environmentId } : {}),
      };

      const previous = existing ? await secrets.get(id) : null;
      await secrets.set(id, token);
      try {
        await store.mutate((cur) => ({
          environments: [...cur.environments.filter((e) => e.id !== id), env],
          activeEnvironmentId: id,
        }));
      } catch (e) {
        if (previous) await secrets.set(id, previous).catch(() => undefined);
        else await secrets.delete(id).catch(() => undefined);
        throw e;
      }
      clients.delete(id);
      return env;
    },

    async updateToken(envId, token) {
      const id = unwrap(validateEnvId(envId));
      const t = unwrap(validateAccessToken(token));
      const env = saved(id);
      if (!env || id === LOCAL_ENV_ID) throw new AppError('VALIDATION_ERROR', 'That machine is not saved any more.');
      if (!secrets.isAvailable()) {
        throw new AppError('VALIDATION_ERROR', 'Secure storage (macOS Keychain) is unavailable, so the token was not saved.');
      }
      await verify(env, t);
      await secrets.set(id, t);
      clients.get(id)?.invalidate();
      clients.delete(id);
    },

    async remove(envId) {
      const id = unwrap(validateEnvId(envId));
      if (id === LOCAL_ENV_ID) throw new AppError('VALIDATION_ERROR', 'The local machine cannot be removed');
      await secrets.delete(id);
      await store.mutate((cur) => ({
        environments: cur.environments.filter((e) => e.id !== id),
        activeTargetByEnv: { [id]: null },
        ...(cur.activeEnvironmentId === id ? { activeEnvironmentId: LOCAL_ENV_ID } : {}),
      }));
      clients.delete(id);
    },
  };
}
