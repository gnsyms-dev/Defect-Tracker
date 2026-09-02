import type { DBSchema } from 'idb';
import type { OutboxRecord } from '../../application/domain/OutboxRecord';

export const OFFLINE_DB_NAME = 'defect-tracker-offline';
export const OFFLINE_DB_VERSION = 1;

export const STORE = {
  Outbox: 'outbox',
  Cache: 'cache',
} as const;

export const OUTBOX_INDEX = {
  ByUserStatus: 'by-user-status',
  ByUserCreated: 'by-user-created',
  ByStatus: 'by-status',
} as const;

export const CACHE_INDEX = {
  ByViewer: 'by-viewer',
  ByFetchedAt: 'by-fetchedAt',
} as const;

export interface CacheRecord {
  /** `${viewerId}|${kind}|${canonicalQuery}` */
  readonly cacheKey: string;
  readonly viewerId: string;
  readonly kind: string;
  /** `unknown`, then zod-parsed on read -- it may have been written by an older build. */
  readonly payload: unknown;
  readonly fetchedAt: number;
}

/**
 * The typed schema. idb's DBSchema generic is the reason this library is worth its
 * ~1kB: store names, key types and index names all become compile-time checked, so a
 * typo in an index name is a build error rather than a runtime DOMException.
 */
export interface OfflineDbSchema extends DBSchema {
  outbox: {
    key: string;
    value: OutboxRecord;
    indexes: {
      // Composite indexes for the two hot reads: a user's badge counts, and their
      // rows in FIFO order for flushing.
      'by-user-status': [string, string];
      'by-user-created': [string, number];
      // Across all users -- one count() answers "does anyone have unsynced work?".
      'by-status': string;
    };
  };
  cache: {
    key: string;
    value: CacheRecord;
    indexes: {
      'by-viewer': string;
      'by-fetchedAt': number;
    };
  };
}
