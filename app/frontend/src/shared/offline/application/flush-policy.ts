import {
  OutboxErrorKind,
  type OutboxError,
  type OutboxRecord,
} from './domain/OutboxRecord';

/** Give up on an item after this many retryable failures (dead-letter cap). */
export const MAX_ATTEMPTS = 10;

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 300_000;
const JITTER_RATIO = 0.2;

/** What actually happened when we tried to flush one record. */
export type FlushOutcome =
  | { readonly kind: 'ok' }
  | {
      readonly kind: 'http';
      readonly status: number;
      readonly responseCode: string | null;
      readonly message: string;
      readonly retryAfterMs?: number;
    }
  /** The request never completed: fetch rejected, or it timed out. */
  | { readonly kind: 'network' }
  /** Our own response-shape bug. Must never dead-letter the user's data. */
  | { readonly kind: 'contract'; readonly message: string };

export type FlushDecision =
  | { readonly kind: 'succeeded' }
  | {
      readonly kind: 'retryLater';
      readonly nextAttemptAt: number;
      /** True for a SYSTEMIC problem: stop the whole loop, not just this item. */
      readonly shouldStopFlush: boolean;
    }
  | { readonly kind: 'deadLettered'; readonly error: OutboxError }
  /** Token expired mid-flush. Keep the item, do not consume an attempt. */
  | { readonly kind: 'authExpired' };

/**
 * Exponential backoff with jitter, capped.
 *
 * The jitter is not decoration: every supervisor's phone reconnects the moment plant
 * wifi returns, and without it that is a synchronised herd hitting one small API
 * process at the same instant.
 */
export function nextAttemptAt(
  attempts: number,
  now: number,
  random: () => number = Math.random,
): number {
  const exponential = BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1);
  const capped = Math.min(exponential, MAX_BACKOFF_MS);
  const jitter = capped * JITTER_RATIO * (random() * 2 - 1);
  return now + Math.round(capped + jitter);
}

/**
 * The single rule that decides an outbox record's fate. Pure, and therefore the
 * highest-value unit under test in the codebase.
 *
 * Two independent questions are being answered at once:
 *   1. Is THIS ITEM doomed?   -> deadLettered vs retryLater
 *   2. Is the SYSTEM down?    -> shouldStopFlush
 *
 * A 400 dooms the item but the system is fine, so the loop continues to the next
 * record. A 500 or a network failure leaves the item perfectly valid but means there
 * is no point trying the rest right now.
 */
export function classifyFlushOutcome(
  outcome: FlushOutcome,
  record: OutboxRecord,
  now: number,
  random: () => number = Math.random,
): FlushDecision {
  if (outcome.kind === 'ok') {
    return { kind: 'succeeded' };
  }

  // Our bug, not the user's payload. Retry rather than destroy their data -- and
  // never mark it failed, because a "fix and resubmit" prompt would be misleading.
  if (outcome.kind === 'contract') {
    return {
      kind: 'retryLater',
      nextAttemptAt: nextAttemptAt(record.attempts + 1, now, random),
      shouldStopFlush: true,
    };
  }

  if (outcome.kind === 'network') {
    return retryOrDeadLetter(record, now, random, {
      kind: OutboxErrorKind.Server,
      message: 'Could not reach the server after several attempts.',
      at: now,
    });
  }

  const { status } = outcome;

  // Expired token. The item is NOT invalid, so it must not consume an attempt or be
  // marked failed -- it flushes after the same user signs in again.
  if (status === 401) {
    return { kind: 'authExpired' };
  }

  // Transient by definition; the payload is fine.
  if (status >= 500 || status === 408 || status === 429) {
    return retryOrDeadLetter(
      record,
      now,
      random,
      {
        kind: OutboxErrorKind.Server,
        httpStatus: status,
        responseCode: outcome.responseCode ?? undefined,
        message: outcome.message,
        at: now,
      },
      outcome.retryAfterMs,
    );
  }

  // Every other 4xx: waiting will never make this payload valid. Retrying forever
  // would drain the battery AND silently lose the entry, because the user would go
  // on believing it is queued. Surface it instead.
  if (status >= 400) {
    return {
      kind: 'deadLettered',
      error: {
        kind:
          status === 403
            ? OutboxErrorKind.Permission
            : status === 409
              ? OutboxErrorKind.Conflict
              : status === 400 || status === 422
                ? OutboxErrorKind.Validation
                : OutboxErrorKind.Unknown,
        httpStatus: status,
        responseCode: outcome.responseCode ?? undefined,
        message: outcome.message,
        at: now,
      },
    };
  }

  // A 3xx or an unexpected 1xx reaching here is not something we can act on.
  return {
    kind: 'deadLettered',
    error: {
      kind: OutboxErrorKind.Unknown,
      httpStatus: status,
      message: outcome.message,
      at: now,
    },
  };
}

function retryOrDeadLetter(
  record: OutboxRecord,
  now: number,
  random: () => number,
  errorIfExhausted: OutboxError,
  retryAfterMs?: number,
): FlushDecision {
  const attempts = record.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    return { kind: 'deadLettered', error: errorIfExhausted };
  }
  return {
    kind: 'retryLater',
    // Honour Retry-After when the server sent one; it knows better than our curve.
    nextAttemptAt:
      retryAfterMs !== undefined
        ? now + retryAfterMs
        : nextAttemptAt(attempts, now, random),
    shouldStopFlush: true,
  };
}
