import { FetchHttpClient } from '@/shared/api/FetchHttpClient';
import type { HttpClient } from '@/shared/api/HttpClient';
import { IdbCacheStore, CACHE_MAX_AGE_MS } from '@/shared/offline/infra/db/IdbCacheStore';
import { IdbOutboxStore } from '@/shared/offline/infra/db/IdbOutboxStore';
import { ConnectivityMonitor } from '@/shared/offline/infra/ConnectivityMonitor';
import { SyncEngine } from '@/shared/offline/infra/SyncEngine';
import type { CacheStore } from '@/shared/offline/application/ports/CacheStore';
import type { OutboxStore } from '@/shared/offline/application/ports/OutboxStore';
import { ApiAuthRepository } from '@/features/auth/infra/repositories/ApiAuthRepository';
import { LocalSessionStore } from '@/features/auth/infra/LocalSessionStore';
import type { AuthRepository } from '@/features/auth/application/ports/AuthRepository';
import type { SessionStore } from '@/features/auth/application/ports/SessionStore';
import { ApiInspectionRepository } from '@/features/inspections/infra/repositories/ApiInspectionRepository';
import { CachedInspectionRepository } from '@/features/inspections/infra/repositories/CachedInspectionRepository';
import { CreateInspectionOutboxHandler } from '@/features/inspections/infra/CreateInspectionOutboxHandler';
import { LogInspectionUseCase } from '@/features/inspections/application/use-cases/LogInspectionUseCase';
import type { InspectionRepository } from '@/features/inspections/application/ports/InspectionRepository';
import { ApiPlantRepository } from '@/features/plants/infra/repositories/ApiPlantRepository';
import type { PlantRepository } from '@/features/plants/application/ports/PlantRepository';
import { SessionTokenHolder, UnauthorizedNotifier } from './sessionTokenHolder';

export interface AppDependencies {
  readonly http: HttpClient;
  readonly tokenHolder: SessionTokenHolder;
  readonly unauthorizedNotifier: UnauthorizedNotifier;
  readonly outbox: OutboxStore;
  readonly cache: CacheStore;
  readonly connectivity: ConnectivityMonitor;
  readonly syncEngine: SyncEngine;
  readonly authRepository: AuthRepository;
  readonly sessionStore: SessionStore;
  readonly inspectionRepository: InspectionRepository;
  readonly plantRepository: PlantRepository;
  readonly logInspection: LogInspectionUseCase;
  /** Set by AuthProvider so infra can read the current viewer without importing it. */
  setCurrentUserId(userId: string | null): void;
  getCurrentUserId(): string | null;
}

/**
 * The composition root: everything is constructed exactly ONCE here.
 *
 * The skill's convention puts a DI context inside each feature's infra/di. With three
 * features whose dependencies are all boot-time singletons, three nested providers
 * would be pure overhead -- so this builds one graph and per-feature hooks select from
 * it, which preserves the feature-facing API without the provider tree. AuthProvider
 * remains a separate, real provider because a session genuinely changes over time.
 */
export function createAppDependencies(): AppDependencies {
  const tokenHolder = new SessionTokenHolder();
  const unauthorizedNotifier = new UnauthorizedNotifier();

  // A mutable holder rather than React state: infra (the sync engine, the cache) needs
  // the current viewer id, and it must not import a React context to get it.
  let currentUserId: string | null = null;
  const getCurrentUserId = (): string | null => currentUserId;

  // Relative by default so requests go through Vite's /api proxy in dev and can be
  // served same-origin in production -- which keeps CORS out of the picture entirely.
  // That matters more than convenience: a CORS rejection is indistinguishable from
  // being offline in JS, so it would make the app believe it is permanently offline
  // and silently queue everything.
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

  const http = new FetchHttpClient({
    baseUrl,
    tokenProvider: tokenHolder,
    onUnauthorized: unauthorizedNotifier.notify,
  });

  const outbox = new IdbOutboxStore();
  const cache = new IdbCacheStore();

  const connectivity = new ConnectivityMonitor({
    // The liveness route is @Public(), so this probes reachability without needing a
    // valid token -- which matters because we probe while the session may be expired.
    probe: async () => {
      try {
        const response = await fetch(`${baseUrl}/`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });
        // ANY response proves reachability, including a 500: the server answered.
        return response.status > 0;
      } catch {
        return false;
      }
    },
  });

  const syncEngine = new SyncEngine({
    outbox,
    connectivity,
    getCurrentUserId,
    onAuthExpired: unauthorizedNotifier.notify,
  });

  const authRepository = new ApiAuthRepository(http);
  const sessionStore = new LocalSessionStore();

  const cachedInspections = new CachedInspectionRepository({
    inner: new ApiInspectionRepository(http),
    cache,
    getViewerId: getCurrentUserId,
  });

  const plantRepository = new ApiPlantRepository({
    http,
    cache,
    getViewerId: getCurrentUserId,
  });

  syncEngine.registerHandler(
    new CreateInspectionOutboxHandler({
      repository: cachedInspections,
      onSynced: () => cachedInspections.invalidateLists(),
    }),
  );

  const logInspection = new LogInspectionUseCase({
    outbox,
    requestFlush: () => syncEngine.requestFlush('enqueue'),
    getCurrentUserId,
    findSynced: async (clientUuid) => {
      // The record left the outbox, so it reached the server. Re-reading the first
      // page is cheap and confirms the stored version rather than guessing.
      try {
        const page = await cachedInspections.list({
          sortBy: 'createdAt',
          sortDir: 'desc',
          page: 1,
          limit: 20,
        });
        const match = page.items.find((item) => item.clientUuid === clientUuid);
        return match ? { kind: 'synced', inspection: match } : null;
      } catch {
        // Confirmation is a nicety; the record is already durable either way.
        return null;
      }
    },
  });

  // Best-effort housekeeping; a failure here must never block startup.
  void cache.sweep(Date.now() - CACHE_MAX_AGE_MS).catch(() => undefined);

  return {
    http,
    tokenHolder,
    unauthorizedNotifier,
    outbox,
    cache,
    connectivity,
    syncEngine,
    authRepository,
    sessionStore,
    inspectionRepository: cachedInspections,
    plantRepository,
    logInspection,
    setCurrentUserId: (userId) => {
      currentUserId = userId;
    },
    getCurrentUserId,
  };
}
