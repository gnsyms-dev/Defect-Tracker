import type { OutboxCounts, OutboxRecord } from '../application/domain/OutboxRecord';
import { classifyFlushOutcome } from '../application/flush-policy';
import type { FlushOutcome } from '../application/flush-policy';
import type { OutboxHandler } from '../application/ports/OutboxHandler';
import type { OutboxStore } from '../application/ports/OutboxStore';
import type { ConnectivityMonitor } from './ConnectivityMonitor';

const FLUSH_LOCK_NAME = 'defect-tracker-outbox-flush';
const STALE_CLAIM_MS = 60_000;
const RETRY_TICK_MS = 30_000;

export type SyncReason =
  | 'enqueue'
  | 'authenticated'
  | 'online-event'
  | 'visible'
  | 'manual'
  | 'timer';

export interface SyncStatus {
  readonly isFlushing: boolean;
  readonly counts: OutboxCounts;
  readonly lastSyncedAt: number | null;
  readonly lastReason: SyncReason | null;
}

const EMPTY_COUNTS: OutboxCounts = { pending: 0, syncing: 0, failed: 0 };

export interface SyncEngineOptions {
  readonly outbox: OutboxStore;
  readonly connectivity: ConnectivityMonitor;
  /** Null when signed out; flushing is per-signed-in-user by design. */
  readonly getCurrentUserId: () => string | null;
  /** Raised when a flush hit a 401 so the auth layer can prompt a re-login. */
  readonly onAuthExpired: () => void;
}

/**
 * Drains the outbox.
 *
 * Foreground-triggered only. The Background Sync API is deliberately not used:
 * iOS Safari has never shipped SyncManager (nor has Firefox), and a plant phone fleet
 * is mixed -- so a foreground design is the only one that works for everyone rather
 * than a compromise. A second, sharper reason: a service worker cannot read
 * localStorage, where the JWT lives, so an SW-side flush would mean duplicating this
 * entire classification path inside the worker for one browser family.
 *
 * The cost is that the queue drains only while the app is open or being reopened.
 * That is mitigated by flushing on `visibilitychange`, so merely opening the app is
 * enough, plus a persistent pending badge that prompts the user to do so.
 */
export class SyncEngine {
  private readonly outbox: OutboxStore;
  private readonly connectivity: ConnectivityMonitor;
  private readonly getCurrentUserId: () => string | null;
  private readonly onAuthExpired: () => void;

  private readonly handlers = new Map<string, OutboxHandler>();
  private readonly listeners = new Set<() => void>();

  private status: SyncStatus = {
    isFlushing: false,
    counts: EMPTY_COUNTS,
    lastSyncedAt: null,
    lastReason: null,
  };

  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private isStarted = false;

  constructor(options: SyncEngineOptions) {
    this.outbox = options.outbox;
    this.connectivity = options.connectivity;
    this.getCurrentUserId = options.getCurrentUserId;
    this.onAuthExpired = options.onAuthExpired;
  }

  registerHandler(handler: OutboxHandler): void {
    this.handlers.set(handler.kind, handler);
  }

  start(): void {
    if (this.isStarted || typeof window === 'undefined') {
      return;
    }
    this.isStarted = true;
    window.addEventListener('online', this.handleOnline);
    document.addEventListener('visibilitychange', this.handleVisible);
    void this.refreshCounts();
  }

  stop(): void {
    if (!this.isStarted || typeof window === 'undefined') {
      return;
    }
    this.isStarted = false;
    window.removeEventListener('online', this.handleOnline);
    document.removeEventListener('visibilitychange', this.handleVisible);
    this.clearTimer();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SyncStatus => this.status;

  async refreshCounts(): Promise<void> {
    const userId = this.getCurrentUserId();
    const counts = userId
      ? await this.outbox.countsByUser(userId)
      : EMPTY_COUNTS;
    this.update({ ...this.status, counts });
    // A timer exists ONLY while there is something to retry -- a clean app schedules
    // no polling at all.
    if (counts.pending > 0) {
      this.ensureTimer();
    } else {
      this.clearTimer();
    }
  }

  /** Single-flight: concurrent callers await the same run. */
  requestFlush(reason: SyncReason): Promise<void> {
    this.inFlight ??= this.runExclusively(reason).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private handleOnline = (): void => {
    void (async () => {
      // Probe before flushing: the 'online' event fires before the radio can
      // necessarily carry a request.
      if (await this.connectivity.checkNow()) {
        await this.requestFlush('online-event');
      }
    })();
  };

  private handleVisible = (): void => {
    if (document.visibilityState === 'visible') {
      void this.requestFlush('visible');
    }
  };

  /**
   * Wraps the flush in a Web Lock so two open tabs cannot drain the queue at once.
   * Falls back to the in-process guard where locks are unavailable.
   */
  private async runExclusively(reason: SyncReason): Promise<void> {
    const locks = navigator.locks;
    if (!locks) {
      return this.flushAll(reason);
    }
    await locks.request(FLUSH_LOCK_NAME, async () => {
      await this.flushAll(reason);
    });
  }

  private async flushAll(reason: SyncReason): Promise<void> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      // Signed out: unsynced records are KEPT, never flushed under another user's
      // token, because loggedByUserId is derived server-side from that token and
      // would misattribute the defect.
      return;
    }

    this.update({ ...this.status, isFlushing: true, lastReason: reason });

    try {
      const now = Date.now();
      await this.outbox.reclaimStale(now - STALE_CLAIM_MS, now);

      // Only the periodic timer respects the per-record backoff. Every other trigger
      // -- reconnecting, the app becoming visible, signing in, or the user tapping
      // "Sync now" -- is new evidence that the previous failure no longer applies, so
      // making the user wait out an exponential delay with a working connection would
      // be the feature appearing broken.
      const flushable = await this.outbox.listFlushable(
        now,
        reason !== 'timer',
      );
      // Serial, not parallel: the uplink is the bottleneck so parallelism just
      // multiplies timeouts, FIFO preserves the supervisor's entry order, and it
      // makes "stop on the first systemic error" trivial.
      for (const record of flushable) {
        if (record.userId !== userId) {
          continue;
        }
        const shouldStop = await this.flushOne(record);
        if (shouldStop) {
          break;
        }
      }
    } finally {
      this.update({ ...this.status, isFlushing: false });
      await this.refreshCounts();
    }
  }

  /** Returns true when the whole loop should stop (a systemic failure). */
  private async flushOne(record: OutboxRecord): Promise<boolean> {
    const handler = this.handlers.get(record.kind);
    if (!handler) {
      // No registered handler: leave it alone rather than destroying it. A later
      // build that registers the handler will pick it up.
      return false;
    }

    const claimed = await this.outbox.claim(record.clientUuid, Date.now());
    if (!claimed) {
      return false;
    }

    const outcome = await this.invokeHandler(handler, claimed);
    const now = Date.now();
    const decision = classifyFlushOutcome(outcome, claimed, now);

    switch (decision.kind) {
      case 'succeeded': {
        await this.outbox.remove(claimed.clientUuid);
        this.connectivity.reportReachable();
        this.update({ ...this.status, lastSyncedAt: now });
        // The feature folds the server's version into its own cache. A failure here
        // must not undo a successful flush.
        try {
          await handler.onSynced?.(claimed.clientUuid);
        } catch {
          // Intentionally ignored: the record IS synced; cache refresh is best-effort.
        }
        return false;
      }
      case 'retryLater': {
        await this.outbox.reschedule(
          claimed.clientUuid,
          decision.nextAttemptAt,
          now,
        );
        if (outcome.kind === 'network') {
          this.connectivity.reportUnreachable();
        }
        return decision.shouldStopFlush;
      }
      case 'deadLettered': {
        await this.outbox.deadLetter(claimed.clientUuid, decision.error, now);
        // The server answered, so we are demonstrably online.
        this.connectivity.reportReachable();
        return false;
      }
      case 'authExpired': {
        // Not a failure and not an attempt: released untouched so it flushes after
        // the same user signs in again.
        await this.outbox.release(claimed.clientUuid, now);
        this.onAuthExpired();
        return true;
      }
    }
  }

  private async invokeHandler(
    handler: OutboxHandler,
    record: OutboxRecord,
  ): Promise<FlushOutcome> {
    // The payload may have been written by a previous deploy of the app, so it is
    // validated rather than trusted.
    const parsed = handler.payloadSchema.safeParse(record.payload);
    if (!parsed.success) {
      return {
        kind: 'http',
        status: 400,
        responseCode: null,
        message:
          'This saved entry is no longer valid for the current app version. Please re-enter it.',
      };
    }

    try {
      return await handler.flush(parsed.data, record.clientUuid);
    } catch (err) {
      // A handler is meant to return a FlushOutcome; a throw is a bug in the handler,
      // not bad user data -- so it must not dead-letter the record.
      return {
        kind: 'contract',
        message: err instanceof Error ? err.message : 'Handler threw unexpectedly',
      };
    }
  }

  private ensureTimer(): void {
    if (this.timer !== null || typeof window === 'undefined') {
      return;
    }
    this.timer = setInterval(() => {
      void this.requestFlush('timer');
    }, RETRY_TICK_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private update(next: SyncStatus): void {
    this.status = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
