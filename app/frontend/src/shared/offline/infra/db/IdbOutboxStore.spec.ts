import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OutboxErrorKind, OutboxStatus } from '../../application/domain/OutboxRecord';
import { IdbOutboxStore } from './IdbOutboxStore';
import { openOfflineDb, resetOfflineDbForTests } from './openOfflineDb';
import { OFFLINE_DB_NAME } from './schema';

// Tested against fake-indexeddb (wired up in vitest.setup.ts) rather than a mock,
// because the behaviour worth verifying IS the store's transaction and index
// behaviour -- a hand-written mock would only assert that the mock works.

const NOW = 1_800_000_000_000;

function input(overrides: Partial<{ clientUuid: string; userId: string }> = {}) {
  return {
    clientUuid: overrides.clientUuid ?? 'client-1',
    userId: overrides.userId ?? 'sup-1',
    kind: 'createInspection',
    payload: { machineLineId: 'LOOMA-004' },
  };
}

describe('IdbOutboxStore', () => {
  let store: IdbOutboxStore;

  beforeEach(async () => {
    resetOfflineDbForTests();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(OFFLINE_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
    store = new IdbOutboxStore();
  });

  afterEach(async () => {
    (await openOfflineDb()).close();
    resetOfflineDbForTests();
  });

  describe('enqueue', () => {
    it('stores a pending record that is immediately flushable', async () => {
      const record = await store.enqueue(input());

      expect(record.status).toBe(OutboxStatus.Pending);
      expect(record.attempts).toBe(0);
      // Immediately eligible, so the submit handler can flush in the same gesture and
      // the online case never paints a "pending" chip.
      expect(await store.listFlushable(Date.now())).toHaveLength(1);
    });

    it('is idempotent: the same clientUuid never creates a second record', async () => {
      const first = await store.enqueue(input());
      const second = await store.enqueue(input());

      expect(second.createdAt).toBe(first.createdAt);
      expect(await store.totalCount()).toBe(1);
    });
  });

  describe('per-user isolation (shared shop-floor device)', () => {
    it('lists only the requesting user\'s records', async () => {
      await store.enqueue(input({ clientUuid: 'c1', userId: 'sup-1' }));
      await store.enqueue(input({ clientUuid: 'c2', userId: 'sup-1' }));
      await store.enqueue(input({ clientUuid: 'c3', userId: 'sup-2' }));

      const forSup1 = await store.listByUser('sup-1');
      expect(forSup1.map((r) => r.clientUuid).sort()).toEqual(['c1', 'c2']);

      const forSup2 = await store.listByUser('sup-2');
      expect(forSup2.map((r) => r.clientUuid)).toEqual(['c3']);
    });

    it('counts per user, but totalCount spans everyone (the logout question)', async () => {
      await store.enqueue(input({ clientUuid: 'c1', userId: 'sup-1' }));
      await store.enqueue(input({ clientUuid: 'c2', userId: 'sup-2' }));

      expect(await store.countsByUser('sup-1')).toEqual({
        pending: 1,
        syncing: 0,
        failed: 0,
      });
      expect(await store.totalCount()).toBe(2);
    });

    it('returns records newest-first for display', async () => {
      await store.enqueue(input({ clientUuid: 'old' }));
      await new Promise((resolve) => setTimeout(resolve, 5));
      await store.enqueue(input({ clientUuid: 'new' }));

      const listed = await store.listByUser('sup-1');
      expect(listed[0].clientUuid).toBe('new');
    });
  });

  describe('claim / complete lifecycle', () => {
    it('moves a record to syncing and out of the flushable set', async () => {
      await store.enqueue(input());
      const claimed = await store.claim('client-1', NOW);

      expect(claimed?.status).toBe(OutboxStatus.Syncing);
      expect(await store.listFlushable(NOW)).toHaveLength(0);
      expect(await store.countsByUser('sup-1')).toMatchObject({ syncing: 1 });
    });

    it('refuses to claim the same record twice', async () => {
      await store.enqueue(input());
      await store.claim('client-1', NOW);

      expect(await store.claim('client-1', NOW)).toBeNull();
    });

    it('returns null when claiming something that does not exist', async () => {
      expect(await store.claim('missing', NOW)).toBeNull();
    });

    it('removes the record on success', async () => {
      await store.enqueue(input());
      await store.claim('client-1', NOW);
      await store.remove('client-1');

      expect(await store.get('client-1')).toBeNull();
      expect(await store.totalCount()).toBe(0);
    });
  });

  describe('reschedule / release / deadLetter', () => {
    it('reschedule increments attempts and gates on nextAttemptAt', async () => {
      await store.enqueue(input());
      await store.claim('client-1', NOW);
      await store.reschedule('client-1', NOW + 60_000, NOW);

      const record = await store.get('client-1');
      expect(record?.status).toBe(OutboxStatus.Pending);
      expect(record?.attempts).toBe(1);
      // Not yet due...
      expect(await store.listFlushable(NOW)).toHaveLength(0);
      // ...but due once the backoff elapses.
      expect(await store.listFlushable(NOW + 60_001)).toHaveLength(1);
    });

    it('release does NOT consume an attempt (the 401 case)', async () => {
      await store.enqueue(input());
      await store.claim('client-1', NOW);
      await store.release('client-1', NOW);

      const record = await store.get('client-1');
      expect(record?.status).toBe(OutboxStatus.Pending);
      // An item flushed after the token expired is not invalid, so it must not be
      // pushed towards the dead-letter cap.
      expect(record?.attempts).toBe(0);
      expect(await store.listFlushable(NOW)).toHaveLength(1);
    });

    it('deadLetter records the error and drops out of the flushable set forever', async () => {
      await store.enqueue(input());
      await store.claim('client-1', NOW);
      await store.deadLetter(
        'client-1',
        {
          kind: OutboxErrorKind.Validation,
          httpStatus: 400,
          message: 'remarks is required',
          at: NOW,
        },
        NOW,
      );

      const record = await store.get('client-1');
      expect(record?.status).toBe(OutboxStatus.Failed);
      if (record?.status !== OutboxStatus.Failed) throw new Error('unreachable');
      expect(record.lastError.message).toBe('remarks is required');
      expect(record.failedAt).toBe(NOW);
      // Never retried automatically -- it needs a human to fix or discard it.
      expect(await store.listFlushable(NOW + 10_000_000)).toHaveLength(0);
      expect(await store.countsByUser('sup-1')).toMatchObject({ failed: 1 });
    });

    it('drops variant-only fields when a failed record is rescheduled', async () => {
      // The record type is a discriminated union; carrying lastError over into a
      // pending record is exactly the illegal state the union exists to prevent.
      await store.enqueue(input());
      await store.deadLetter(
        'client-1',
        { kind: OutboxErrorKind.Server, message: 'boom', at: NOW },
        NOW,
      );
      await store.reschedule('client-1', NOW + 1000, NOW);

      const record = await store.get('client-1');
      expect(record?.status).toBe(OutboxStatus.Pending);
      expect(record).not.toHaveProperty('lastError');
      expect(record).not.toHaveProperty('failedAt');
    });
  });

  describe('reclaimStale', () => {
    it('returns a record stuck in syncing back to pending', async () => {
      // A tab killed mid-request is routine on a phone; without this the record
      // would sit in `syncing` forever and never retry.
      await store.enqueue(input());
      await store.claim('client-1', NOW);

      const reclaimed = await store.reclaimStale(NOW + 60_000, NOW + 60_000);

      expect(reclaimed).toBe(1);
      const record = await store.get('client-1');
      expect(record?.status).toBe(OutboxStatus.Pending);
      // Not treated as a failed attempt: nothing is known to have gone wrong.
      expect(record?.attempts).toBe(0);
    });

    it('leaves a freshly-claimed record alone', async () => {
      await store.enqueue(input());
      await store.claim('client-1', NOW);

      expect(await store.reclaimStale(NOW - 60_000, NOW)).toBe(0);
      expect((await store.get('client-1'))?.status).toBe(OutboxStatus.Syncing);
    });
  });

  describe('listFlushable ordering', () => {
    it('is FIFO by creation, preserving the order entries were logged', async () => {
      await store.enqueue(input({ clientUuid: 'first' }));
      await new Promise((resolve) => setTimeout(resolve, 5));
      await store.enqueue(input({ clientUuid: 'second' }));
      await new Promise((resolve) => setTimeout(resolve, 5));
      await store.enqueue(input({ clientUuid: 'third' }));

      const flushable = await store.listFlushable(Date.now());
      expect(flushable.map((r) => r.clientUuid)).toEqual([
        'first',
        'second',
        'third',
      ]);
    });

    it('ignoreBackoff surfaces a backed-off record, so reconnecting does not wait', async () => {
      // Backoff protects a failing server from being hammered. A reconnect (or a user
      // tapping "Sync now") is new information that makes the earlier failure
      // irrelevant -- without this, a supervisor would watch "Not synced" for up to
      // five minutes on a working connection.
      await store.enqueue(input());
      await store.claim('client-1', NOW);
      await store.reschedule('client-1', NOW + 300_000, NOW);

      expect(await store.listFlushable(NOW)).toHaveLength(0);
      expect(await store.listFlushable(NOW, true)).toHaveLength(1);
    });

    it('ignoreBackoff still excludes failed records', async () => {
      // A dead-lettered entry needs a human, not a retry -- bypassing backoff must not
      // quietly resurrect it.
      await store.enqueue(input());
      await store.deadLetter(
        'client-1',
        { kind: OutboxErrorKind.Validation, message: 'invalid', at: NOW },
        NOW,
      );
      expect(await store.listFlushable(NOW, true)).toHaveLength(0);
    });

    it('includes records from every user, since flushing is not per-user', async () => {
      await store.enqueue(input({ clientUuid: 'c1', userId: 'sup-1' }));
      await store.enqueue(input({ clientUuid: 'c2', userId: 'sup-2' }));

      expect(await store.listFlushable(Date.now())).toHaveLength(2);
    });
  });
});
