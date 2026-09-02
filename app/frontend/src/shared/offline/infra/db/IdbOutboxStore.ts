import type { IDBPDatabase } from 'idb';
import {
  OutboxStatus,
  type OutboxCounts,
  type OutboxError,
  type OutboxRecord,
} from '../../application/domain/OutboxRecord';
import type {
  EnqueueOutboxInput,
  OutboxStore,
} from '../../application/ports/OutboxStore';
import { openOfflineDb } from './openOfflineDb';
import { OUTBOX_INDEX, STORE, type OfflineDbSchema } from './schema';

export class IdbOutboxStore implements OutboxStore {
  private readonly dbFactory: () => Promise<IDBPDatabase<OfflineDbSchema>>;

  constructor(
    dbFactory: () => Promise<IDBPDatabase<OfflineDbSchema>> = openOfflineDb,
  ) {
    this.dbFactory = dbFactory;
  }

  async enqueue(input: EnqueueOutboxInput): Promise<OutboxRecord> {
    const db = await this.dbFactory();
    const now = Date.now();

    const existing = await db.get(STORE.Outbox, input.clientUuid);
    if (existing) {
      // Idempotent by construction: clientUuid is the key, so a re-enqueue of the
      // same id is a no-op rather than a duplicate row.
      return existing;
    }

    const record: OutboxRecord = {
      clientUuid: input.clientUuid,
      userId: input.userId,
      kind: input.kind,
      payload: input.payload,
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      status: OutboxStatus.Pending,
      // Immediately eligible: the submit handler flushes in the same gesture so the
      // common online case never paints a "pending" chip at all.
      nextAttemptAt: now,
    };

    await db.put(STORE.Outbox, record);
    return record;
  }

  async get(clientUuid: string): Promise<OutboxRecord | null> {
    const db = await this.dbFactory();
    return (await db.get(STORE.Outbox, clientUuid)) ?? null;
  }

  async listByUser(userId: string): Promise<readonly OutboxRecord[]> {
    const db = await this.dbFactory();
    const records = await db.getAllFromIndex(
      STORE.Outbox,
      OUTBOX_INDEX.ByUserCreated,
      IDBKeyRange.bound([userId, -Infinity], [userId, Infinity]),
    );
    // Newest first: what the supervisor just typed should be at the top.
    return [...records].sort((a, b) => b.createdAt - a.createdAt);
  }

  async listFlushable(
    now: number,
    ignoreBackoff = false,
  ): Promise<readonly OutboxRecord[]> {
    const db = await this.dbFactory();
    const pending = await db.getAllFromIndex(
      STORE.Outbox,
      OUTBOX_INDEX.ByStatus,
      OutboxStatus.Pending,
    );
    return pending
      .filter(
        (record) =>
          record.status === OutboxStatus.Pending &&
          (ignoreBackoff || record.nextAttemptAt <= now),
      )
      // FIFO by creation: preserves the order the supervisor entered them, which is
      // also the order they will appear in the list once synced.
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async claim(clientUuid: string, now: number): Promise<OutboxRecord | null> {
    const db = await this.dbFactory();
    const tx = db.transaction(STORE.Outbox, 'readwrite');
    const current = await tx.store.get(clientUuid);

    if (!current || current.status !== OutboxStatus.Pending) {
      await tx.done;
      return null;
    }

    const claimed: OutboxRecord = {
      clientUuid: current.clientUuid,
      userId: current.userId,
      kind: current.kind,
      payload: current.payload,
      createdAt: current.createdAt,
      updatedAt: now,
      attempts: current.attempts,
      status: OutboxStatus.Syncing,
      claimedAt: now,
    };

    await tx.store.put(claimed);
    await tx.done;
    return claimed;
  }

  async remove(clientUuid: string): Promise<void> {
    const db = await this.dbFactory();
    await db.delete(STORE.Outbox, clientUuid);
  }

  async reschedule(
    clientUuid: string,
    nextAttemptAt: number,
    now: number,
  ): Promise<void> {
    await this.mutate(clientUuid, (current) => ({
      ...stripVariantFields(current),
      updatedAt: now,
      attempts: current.attempts + 1,
      status: OutboxStatus.Pending,
      nextAttemptAt,
    }));
  }

  async release(clientUuid: string, now: number): Promise<void> {
    // No attempts increment: used for the 401 case, where the item is perfectly
    // valid and only the session expired.
    await this.mutate(clientUuid, (current) => ({
      ...stripVariantFields(current),
      updatedAt: now,
      attempts: current.attempts,
      status: OutboxStatus.Pending,
      nextAttemptAt: now,
    }));
  }

  async deadLetter(
    clientUuid: string,
    error: OutboxError,
    now: number,
  ): Promise<void> {
    await this.mutate(clientUuid, (current) => ({
      ...stripVariantFields(current),
      updatedAt: now,
      attempts: current.attempts + 1,
      status: OutboxStatus.Failed,
      lastError: error,
      failedAt: now,
    }));
  }

  async reclaimStale(staleBefore: number, now: number): Promise<number> {
    const db = await this.dbFactory();
    const tx = db.transaction(STORE.Outbox, 'readwrite');
    const syncing = await tx.store
      .index(OUTBOX_INDEX.ByStatus)
      .getAll(OutboxStatus.Syncing);

    let reclaimed = 0;
    for (const record of syncing) {
      // A tab killed mid-request leaves a record stuck in `syncing` forever, which on
      // a phone (where backgrounded tabs get discarded) is routine rather than rare.
      if (record.status === OutboxStatus.Syncing && record.claimedAt < staleBefore) {
        await tx.store.put({
          ...stripVariantFields(record),
          updatedAt: now,
          attempts: record.attempts,
          status: OutboxStatus.Pending,
          nextAttemptAt: now,
        });
        reclaimed += 1;
      }
    }

    await tx.done;
    return reclaimed;
  }

  async countsByUser(userId: string): Promise<OutboxCounts> {
    const db = await this.dbFactory();
    const index = db
      .transaction(STORE.Outbox)
      .store.index(OUTBOX_INDEX.ByUserStatus);

    const [pending, syncing, failed] = await Promise.all([
      index.count([userId, OutboxStatus.Pending]),
      index.count([userId, OutboxStatus.Syncing]),
      index.count([userId, OutboxStatus.Failed]),
    ]);

    return { pending, syncing, failed };
  }

  async totalCount(): Promise<number> {
    const db = await this.dbFactory();
    return db.count(STORE.Outbox);
  }

  private async mutate(
    clientUuid: string,
    update: (current: OutboxRecord) => OutboxRecord,
  ): Promise<void> {
    const db = await this.dbFactory();
    const tx = db.transaction(STORE.Outbox, 'readwrite');
    const current = await tx.store.get(clientUuid);
    if (current) {
      await tx.store.put(update(current));
    }
    await tx.done;
  }
}

/**
 * Keeps only the fields common to every variant.
 *
 * Needed because the record type is a discriminated union: spreading a `failed`
 * record into a `pending` one would carry `lastError`/`failedAt` along, which is
 * exactly the illegal state the union exists to prevent.
 */
function stripVariantFields(record: OutboxRecord): {
  clientUuid: string;
  userId: string;
  kind: string;
  payload: unknown;
  createdAt: number;
} {
  return {
    clientUuid: record.clientUuid,
    userId: record.userId,
    kind: record.kind,
    payload: record.payload,
    createdAt: record.createdAt,
  };
}
