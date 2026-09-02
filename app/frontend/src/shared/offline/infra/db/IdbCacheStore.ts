import type { IDBPDatabase } from 'idb';
import type { z } from 'zod';
import {
  CacheKind,
  type CacheEntry,
  type CacheStore,
} from '../../application/ports/CacheStore';
import { openOfflineDb } from './openOfflineDb';
import { CACHE_INDEX, STORE, type OfflineDbSchema } from './schema';

/** Per-viewer cap. Beyond this, oldest entries are evicted. */
const MAX_ENTRIES_PER_VIEWER = 30;
/** Anything older than a week is swept on boot. */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class IdbCacheStore implements CacheStore {
  private readonly dbFactory: () => Promise<IDBPDatabase<OfflineDbSchema>>;

  constructor(
    dbFactory: () => Promise<IDBPDatabase<OfflineDbSchema>> = openOfflineDb,
  ) {
    this.dbFactory = dbFactory;
  }

  async read<T>(
    viewerId: string,
    kind: CacheKind,
    query: string,
    schema: z.ZodType<T>,
  ): Promise<CacheEntry<T> | null> {
    const db = await this.dbFactory();
    const record = await db.get(STORE.Cache, cacheKey(viewerId, kind, query));
    if (!record) {
      return null;
    }

    // Validated, not asserted: this row may have been written by a previous deploy,
    // so its shape is genuinely unknown. An invalid entry is dropped and reported as
    // a miss rather than crashing the screen that reads it.
    const parsed = schema.safeParse(record.payload);
    if (!parsed.success) {
      await db.delete(STORE.Cache, record.cacheKey);
      return null;
    }

    return { data: parsed.data, fetchedAt: record.fetchedAt };
  }

  async write(
    viewerId: string,
    kind: CacheKind,
    query: string,
    data: unknown,
  ): Promise<void> {
    const db = await this.dbFactory();
    try {
      await db.put(STORE.Cache, {
        cacheKey: cacheKey(viewerId, kind, query),
        viewerId,
        kind,
        payload: data,
        fetchedAt: Date.now(),
      });
      await this.evictOverflow(viewerId);
    } catch (err) {
      // A full quota must never break the app: the cache is a convenience, and the
      // outbox (the only copy of unsynced work) is written in a SEPARATE transaction
      // precisely so a failure here can never roll it back.
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        await this.evictHalf(viewerId);
        return;
      }
      throw err;
    }
  }

  async invalidateKinds(
    viewerId: string,
    kinds: readonly CacheKind[],
  ): Promise<void> {
    const db = await this.dbFactory();
    const tx = db.transaction(STORE.Cache, 'readwrite');
    const records = await tx.store.index(CACHE_INDEX.ByViewer).getAll(viewerId);
    const wanted = new Set<string>(kinds);

    for (const record of records) {
      if (wanted.has(record.kind)) {
        await tx.store.delete(record.cacheKey);
      }
    }
    await tx.done;
  }

  async invalidateViewer(viewerId: string): Promise<void> {
    const db = await this.dbFactory();
    const tx = db.transaction(STORE.Cache, 'readwrite');
    const keys = await tx.store.index(CACHE_INDEX.ByViewer).getAllKeys(viewerId);
    for (const key of keys) {
      await tx.store.delete(key);
    }
    await tx.done;
  }

  async sweep(olderThan: number): Promise<number> {
    const db = await this.dbFactory();
    const tx = db.transaction(STORE.Cache, 'readwrite');
    const keys = await tx.store
      .index(CACHE_INDEX.ByFetchedAt)
      .getAllKeys(IDBKeyRange.upperBound(olderThan));
    for (const key of keys) {
      await tx.store.delete(key);
    }
    await tx.done;
    return keys.length;
  }

  private async evictOverflow(viewerId: string): Promise<void> {
    const db = await this.dbFactory();
    const records = await db.getAllFromIndex(
      STORE.Cache,
      CACHE_INDEX.ByViewer,
      viewerId,
    );
    if (records.length <= MAX_ENTRIES_PER_VIEWER) {
      return;
    }
    const excess = [...records]
      .sort((a, b) => a.fetchedAt - b.fetchedAt)
      .slice(0, records.length - MAX_ENTRIES_PER_VIEWER);
    for (const record of excess) {
      await db.delete(STORE.Cache, record.cacheKey);
    }
  }

  private async evictHalf(viewerId: string): Promise<void> {
    const db = await this.dbFactory();
    const records = await db.getAllFromIndex(
      STORE.Cache,
      CACHE_INDEX.ByViewer,
      viewerId,
    );
    const oldest = [...records]
      .sort((a, b) => a.fetchedAt - b.fetchedAt)
      .slice(0, Math.ceil(records.length / 2));
    for (const record of oldest) {
      await db.delete(STORE.Cache, record.cacheKey);
    }
  }
}

/**
 * Composite key.
 *
 * `query` is the output of canonicalQuery(), which is also what builds the request
 * URL -- so `?a=1&b=2` and `?b=2&a=1` cannot produce two entries for one logical
 * query.
 */
function cacheKey(viewerId: string, kind: CacheKind, query: string): string {
  return `${viewerId}|${kind}|${query}`;
}

export { CacheKind };
