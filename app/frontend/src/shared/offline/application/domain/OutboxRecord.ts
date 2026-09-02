export const OutboxStatus = {
  Pending: 'pending',
  Syncing: 'syncing',
  Failed: 'failed',
} as const;
export type OutboxStatus = (typeof OutboxStatus)[keyof typeof OutboxStatus];

export const OutboxErrorKind = {
  Validation: 'validation',
  Permission: 'permission',
  Conflict: 'conflict',
  Server: 'server',
  Unknown: 'unknown',
} as const;
export type OutboxErrorKind =
  (typeof OutboxErrorKind)[keyof typeof OutboxErrorKind];

export interface OutboxError {
  readonly kind: OutboxErrorKind;
  readonly httpStatus?: number;
  readonly responseCode?: string;
  /**
   * Shown to the user verbatim. Never parsed for field names: the backend's
   * exception filter comma-joins validation messages into one string, so per-field
   * structure is not recoverable.
   */
  readonly message: string;
  readonly at: number;
}

interface OutboxRecordBase {
  /** Also the store's keyPath AND the server's idempotency key. */
  readonly clientUuid: string;
  /** Who created it. Scopes visibility on a shared shop-floor device. */
  readonly userId: string;
  /** Which handler knows how to flush this. */
  readonly kind: string;
  /**
   * Deliberately `unknown`: shared/offline owns a GENERIC queue and must not know
   * what an inspection is. The registered OutboxHandler validates this with its own
   * zod schema when reading it back -- which matters because a record may have been
   * written by a previous deploy of the app.
   */
  readonly payload: unknown;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly attempts: number;
}

/**
 * A discriminated union, so illegal states are unrepresentable:
 * `lastError` exists ONLY on failed, `nextAttemptAt` only on pending, `claimedAt`
 * only on syncing. No `if (status === 'failed' && record.lastError)` anywhere.
 */
export type PendingOutboxRecord = OutboxRecordBase & {
  readonly status: typeof OutboxStatus.Pending;
  /** Backoff gate; only meaningful while pending. */
  readonly nextAttemptAt: number;
};

export type SyncingOutboxRecord = OutboxRecordBase & {
  readonly status: typeof OutboxStatus.Syncing;
  /** Drives stale-claim recovery after a tab is killed mid-request. */
  readonly claimedAt: number;
};

export type FailedOutboxRecord = OutboxRecordBase & {
  readonly status: typeof OutboxStatus.Failed;
  readonly lastError: OutboxError;
  readonly failedAt: number;
};

export type OutboxRecord =
  | PendingOutboxRecord
  | SyncingOutboxRecord
  | FailedOutboxRecord;

export interface OutboxCounts {
  readonly pending: number;
  readonly syncing: number;
  readonly failed: number;
}

export function isPending(record: OutboxRecord): record is PendingOutboxRecord {
  return record.status === OutboxStatus.Pending;
}

export function isFailed(record: OutboxRecord): record is FailedOutboxRecord {
  return record.status === OutboxStatus.Failed;
}
