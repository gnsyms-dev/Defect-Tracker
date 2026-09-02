import { describe, expect, it } from 'vitest';
import {
  OutboxStatus,
  type OutboxRecord,
} from './domain/OutboxRecord';
import {
  classifyFlushOutcome,
  MAX_ATTEMPTS,
  nextAttemptAt,
  type FlushOutcome,
} from './flush-policy';

const NOW = 1_800_000_000_000;
// Deterministic "random" so jitter does not make assertions flaky.
const noJitter = () => 0.5;

function record(attempts = 0): OutboxRecord {
  return {
    clientUuid: 'client-1',
    userId: 'sup-1',
    kind: 'createInspection',
    payload: {},
    createdAt: NOW - 60_000,
    updatedAt: NOW - 60_000,
    attempts,
    status: OutboxStatus.Pending,
    nextAttemptAt: NOW,
  };
}

function http(
  status: number,
  message = 'boom',
  extra: Partial<Extract<FlushOutcome, { kind: 'http' }>> = {},
): FlushOutcome {
  return { kind: 'http', status, responseCode: null, message, ...extra };
}

describe('classifyFlushOutcome', () => {
  it('marks a 2xx as succeeded', () => {
    expect(classifyFlushOutcome({ kind: 'ok' }, record(), NOW, noJitter)).toEqual({
      kind: 'succeeded',
    });
  });

  describe('systemic failures: keep the item, STOP the loop', () => {
    it.each([
      ['network error', { kind: 'network' } as FlushOutcome],
      ['500', http(500)],
      ['503', http(503)],
      ['408 request timeout', http(408)],
      ['429 too many requests', http(429)],
    ])('%s -> retryLater with shouldStopFlush', (_label, outcome) => {
      const decision = classifyFlushOutcome(outcome, record(), NOW, noJitter);

      expect(decision.kind).toBe('retryLater');
      if (decision.kind !== 'retryLater') throw new Error('unreachable');
      // Stopping matters: firing the remaining N records into a dead network or a
      // sick server would just multiply timeouts.
      expect(decision.shouldStopFlush).toBe(true);
      expect(decision.nextAttemptAt).toBeGreaterThan(NOW);
    });

    it('honours a server-supplied Retry-After over our own curve', () => {
      const decision = classifyFlushOutcome(
        http(429, 'slow down', { retryAfterMs: 90_000 }),
        record(),
        NOW,
        noJitter,
      );

      if (decision.kind !== 'retryLater') throw new Error('unreachable');
      expect(decision.nextAttemptAt).toBe(NOW + 90_000);
    });
  });

  describe('item-specific failures: dead-letter the item, CONTINUE the loop', () => {
    it.each([
      ['400 validation', 400, 'validation'],
      ['422 unprocessable', 422, 'validation'],
      ['403 forbidden', 403, 'permission'],
      ['409 conflict', 409, 'conflict'],
      ['418 unexpected 4xx', 418, 'unknown'],
    ])('%s -> deadLettered (%s)', (_label, status, kind) => {
      const decision = classifyFlushOutcome(
        http(status, 'nope'),
        record(),
        NOW,
        noJitter,
      );

      expect(decision.kind).toBe('deadLettered');
      if (decision.kind !== 'deadLettered') throw new Error('unreachable');
      expect(decision.error.kind).toBe(kind);
      expect(decision.error.httpStatus).toBe(status);
      expect(decision.error.message).toBe('nope');
    });

    it('never retries a 4xx, because waiting cannot make the payload valid', () => {
      // Retrying forever would drain the battery AND silently lose the entry, since
      // the user would keep believing it is queued.
      for (const status of [400, 403, 409, 422]) {
        const decision = classifyFlushOutcome(
          http(status),
          record(),
          NOW,
          noJitter,
        );
        expect(decision.kind).not.toBe('retryLater');
      }
    });
  });

  describe('401 is special: not invalid, not a failure', () => {
    it('returns authExpired', () => {
      expect(
        classifyFlushOutcome(http(401, 'expired'), record(3), NOW, noJitter),
      ).toEqual({ kind: 'authExpired' });
    });

    it('does not consume an attempt or dead-letter, even at the attempt cap', () => {
      // An item flushed after the JWT expired is perfectly valid; consuming attempts
      // would eventually destroy it for a reason that has nothing to do with it.
      const decision = classifyFlushOutcome(
        http(401),
        record(MAX_ATTEMPTS - 1),
        NOW,
        noJitter,
      );
      expect(decision.kind).toBe('authExpired');
    });
  });

  describe('contract errors are OUR bug', () => {
    it('retries and stops the loop, but never dead-letters the user data', () => {
      const decision = classifyFlushOutcome(
        { kind: 'contract', message: 'shape mismatch' },
        record(),
        NOW,
        noJitter,
      );

      expect(decision.kind).toBe('retryLater');
      if (decision.kind !== 'retryLater') throw new Error('unreachable');
      expect(decision.shouldStopFlush).toBe(true);
    });

    it('does not dead-letter even at the attempt cap', () => {
      const decision = classifyFlushOutcome(
        { kind: 'contract', message: 'shape mismatch' },
        record(MAX_ATTEMPTS + 5),
        NOW,
        noJitter,
      );
      expect(decision.kind).toBe('retryLater');
    });
  });

  describe('dead-letter cap', () => {
    it('dead-letters a retryable failure once attempts reach the cap', () => {
      const decision = classifyFlushOutcome(
        { kind: 'network' },
        record(MAX_ATTEMPTS - 1),
        NOW,
        noJitter,
      );

      expect(decision.kind).toBe('deadLettered');
      if (decision.kind !== 'deadLettered') throw new Error('unreachable');
      expect(decision.error.kind).toBe('server');
    });

    it('still retries one attempt below the cap', () => {
      const decision = classifyFlushOutcome(
        { kind: 'network' },
        record(MAX_ATTEMPTS - 2),
        NOW,
        noJitter,
      );
      expect(decision.kind).toBe('retryLater');
    });
  });
});

describe('nextAttemptAt', () => {
  it('grows exponentially from 30s', () => {
    expect(nextAttemptAt(1, NOW, noJitter) - NOW).toBe(30_000);
    expect(nextAttemptAt(2, NOW, noJitter) - NOW).toBe(60_000);
    expect(nextAttemptAt(3, NOW, noJitter) - NOW).toBe(120_000);
    expect(nextAttemptAt(4, NOW, noJitter) - NOW).toBe(240_000);
  });

  it('caps at 5 minutes rather than growing without bound', () => {
    for (const attempts of [5, 6, 10, 50]) {
      expect(nextAttemptAt(attempts, NOW, noJitter) - NOW).toBe(300_000);
    }
  });

  it('is monotonically non-decreasing up to the cap', () => {
    let previous = 0;
    for (let attempts = 1; attempts <= 12; attempts += 1) {
      const delay = nextAttemptAt(attempts, NOW, noJitter) - NOW;
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });

  it('applies jitter within +/-20%, so reconnecting devices do not stampede', () => {
    const base = 120_000;
    const lowest = nextAttemptAt(3, NOW, () => 0) - NOW;
    const highest = nextAttemptAt(3, NOW, () => 1) - NOW;

    expect(lowest).toBe(base * 0.8);
    expect(highest).toBe(base * 1.2);
    expect(lowest).toBeLessThan(highest);
  });

  it('never schedules in the past', () => {
    for (let attempts = 1; attempts <= 12; attempts += 1) {
      expect(nextAttemptAt(attempts, NOW, () => 0)).toBeGreaterThan(NOW);
    }
  });
});
