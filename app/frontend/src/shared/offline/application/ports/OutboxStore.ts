import type {
  OutboxCounts,
  OutboxError,
  OutboxRecord,
} from '../domain/OutboxRecord';

export interface EnqueueOutboxInput {
  readonly clientUuid: string;
  readonly userId: string;
  readonly kind: string;
  readonly payload: unknown;
}

export interface OutboxStore {
  /**
   * Idempotent by construction: `clientUuid` is the store's key, so enqueuing the
   * same id twice cannot create two records.
   */
  enqueue(input: EnqueueOutboxInput): Promise<OutboxRecord>;

  get(clientUuid: string): Promise<OutboxRecord | null>;

  /** Newest first -- what a supervisor just typed belongs at the top of the list. */
  listByUser(userId: string): Promise<readonly OutboxRecord[]>;

  /**
   * Oldest first. FIFO preserves the order entries were logged.
   *
   * `ignoreBackoff` exists because backoff and reconnection answer different
   * questions. Backoff protects a FAILING server from being hammered; a fresh
   * connectivity signal (or a user tapping "Sync now") is NEW INFORMATION that makes
   * the previous failure irrelevant. Without this, reconnecting would leave a
   * supervisor staring at "Not synced" for up to five minutes with a working
   * connection -- which reads as the feature being broken.
   */
  listFlushable(
    now: number,
    ignoreBackoff?: boolean,
  ): Promise<readonly OutboxRecord[]>;

  /** Marks a record `syncing`. Returns null if it is gone or no longer flushable. */
  claim(clientUuid: string, now: number): Promise<OutboxRecord | null>;

  /** Successful flush: the record's job is done. */
  remove(clientUuid: string): Promise<void>;

  /** Retryable failure: back to pending, attempts incremented, backoff set. */
  reschedule(
    clientUuid: string,
    nextAttemptAt: number,
    now: number,
  ): Promise<void>;

  /** Released without consuming an attempt -- used for the 401 case. */
  release(clientUuid: string, now: number): Promise<void>;

  /** Permanently failed: needs a human to edit or discard it. */
  deadLetter(clientUuid: string, error: OutboxError, now: number): Promise<void>;

  /**
   * Returns anything stuck in `syncing` since before `staleBefore` to `pending`.
   * A tab killed mid-request is routine on a phone, and without this its record
   * would never be retried.
   */
  reclaimStale(staleBefore: number, now: number): Promise<number>;

  countsByUser(userId: string): Promise<OutboxCounts>;

  /** Across all users -- answers "does anyone have unsynced work?" at logout. */
  totalCount(): Promise<number>;
}
