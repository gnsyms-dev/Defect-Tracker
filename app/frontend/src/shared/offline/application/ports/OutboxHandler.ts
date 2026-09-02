import type { z } from 'zod';
import type { FlushOutcome } from '../flush-policy';

/**
 * How a feature teaches the generic sync engine to flush ONE kind of queued write.
 *
 * This is what keeps `shared/offline` from becoming a god-service: the engine knows
 * about queues, backoff and error classification; it knows nothing about
 * inspections. The inspections feature registers a handler at composition time.
 *
 * Open/Closed: a second offline-capable write is a new handler, never an edit to the
 * engine. Dependency Inversion: the engine depends on this port, not on a concrete
 * repository.
 */
export interface OutboxHandler<TPayload = unknown> {
  readonly kind: string;

  /**
   * Validates a payload read back out of IndexedDB, which may have been written by
   * an earlier version of the app.
   */
  readonly payloadSchema: z.ZodType<TPayload>;

  /**
   * Performs the write. Returns a FlushOutcome rather than throwing, so the engine
   * never has to interpret exception types -- classification stays in one pure
   * function.
   */
  flush(payload: TPayload, clientUuid: string): Promise<FlushOutcome>;

  /**
   * Called after a successful flush, so the feature can fold the server's version
   * into its own cache and notify its UI. Failures here must not fail the flush.
   */
  onSynced?(clientUuid: string): Promise<void>;
}
