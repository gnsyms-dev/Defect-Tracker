import { openDB, type IDBPDatabase } from 'idb';
import {
  CACHE_INDEX,
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  OUTBOX_INDEX,
  STORE,
  type OfflineDbSchema,
} from './schema';

let dbPromise: Promise<IDBPDatabase<OfflineDbSchema>> | null = null;

/**
 * Opens (and memoises) the offline database.
 *
 * One database with a `userId` on every record, NOT a database per user. A
 * per-user database would need `indexedDB.databases()` to answer "does anyone have
 * unsynced items?" at logout -- and Firefox does not implement it -- and would force
 * a reopen on every sign-in.
 */
export function openOfflineDb(): Promise<IDBPDatabase<OfflineDbSchema>> {
  dbPromise ??= openDB<OfflineDbSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE.Outbox)) {
        const outbox = db.createObjectStore(STORE.Outbox, {
          // clientUuid is ALREADY the server's idempotency key, so using it as the
          // primary key makes "is this enqueued?" a single get() and makes a
          // duplicate enqueue idempotent by construction rather than by a check.
          keyPath: 'clientUuid',
        });
        outbox.createIndex(OUTBOX_INDEX.ByUserStatus, ['userId', 'status']);
        outbox.createIndex(OUTBOX_INDEX.ByUserCreated, ['userId', 'createdAt']);
        outbox.createIndex(OUTBOX_INDEX.ByStatus, 'status');
      }

      if (!db.objectStoreNames.contains(STORE.Cache)) {
        const cache = db.createObjectStore(STORE.Cache, {
          keyPath: 'cacheKey',
        });
        cache.createIndex(CACHE_INDEX.ByViewer, 'viewerId');
        cache.createIndex(CACHE_INDEX.ByFetchedAt, 'fetchedAt');
      }
    },
  });

  return dbPromise;
}

/** Test-only: forces the next openOfflineDb() to reopen. */
export function resetOfflineDbForTests(): void {
  dbPromise = null;
}
