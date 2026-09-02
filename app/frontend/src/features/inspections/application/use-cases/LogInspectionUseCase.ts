import type { OutboxStore } from '@/shared/offline/application/ports/OutboxStore';
import { OutboxStatus } from '@/shared/offline/application/domain/OutboxRecord';
import { newClientUuid } from '@/shared/offline/infra/uuid';
import { nowIsoWithOffset } from '@/shared/lib/datetime';
import type { DraftInspection } from '../domain/entities/DraftInspection';
import type { LogInspectionOutcome } from '../ports/InspectionRepository';
import type { DefectType } from '../domain/DefectType';
import type { Severity } from '../domain/Severity';

export interface LogInspectionInput {
  readonly inspectionDate: string;
  readonly machineLineId: string;
  readonly defectType: DefectType;
  readonly severity: Severity;
  readonly remarks: string | null;
}

export class LogInspectionFailedError extends Error {
  readonly clientUuid: string;

  constructor(message: string, clientUuid: string) {
    super(message);
    this.name = 'LogInspectionFailedError';
    this.clientUuid = clientUuid;
  }
}

/**
 * Records an inspection, durably, before the network is ever touched.
 *
 * ALWAYS-OUTBOX-FIRST, with no `navigator.onLine` branch. Two reasons:
 *
 *  1. One code path means one answer to "did it save?". Branching gives four states,
 *     and the fourth -- online-but-actually-offline -- is where data dies: the request
 *     leaves, the phone sleeps or the radio drops, and the record exists nowhere.
 *     Writing to IndexedDB first makes the worst case a duplicate ATTEMPT, which
 *     clientUuid idempotency already makes free.
 *  2. "Pending" becomes a first-class, reachable, testable state rather than a rare
 *     branch nobody exercises.
 *
 * The apparent cost -- a "pending" chip even when online -- is avoided by flushing in
 * the same user gesture: on success the row is confirmed before the screen changes, so
 * the chip never paints.
 */
export class LogInspectionUseCase {
  private readonly outbox: OutboxStore;
  private readonly requestFlush: () => Promise<void>;
  private readonly getCurrentUserId: () => string | null;
  private readonly findSynced: (clientUuid: string) => Promise<LogInspectionOutcome | null>;

  constructor(params: {
    outbox: OutboxStore;
    requestFlush: () => Promise<void>;
    getCurrentUserId: () => string | null;
    findSynced: (clientUuid: string) => Promise<LogInspectionOutcome | null>;
  }) {
    this.outbox = params.outbox;
    this.requestFlush = params.requestFlush;
    this.getCurrentUserId = params.getCurrentUserId;
    this.findSynced = params.findSynced;
  }

  async execute(input: LogInspectionInput): Promise<LogInspectionOutcome> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      throw new Error('Cannot log an inspection without a signed-in user.');
    }

    const draft: DraftInspection = {
      clientUuid: newClientUuid(),
      inspectionDate: input.inspectionDate,
      machineLineId: input.machineLineId.trim(),
      defectType: input.defectType,
      severity: input.severity,
      remarks: input.remarks?.trim() ? input.remarks.trim() : null,
      // The device clock, with an explicit offset. The server clamps forward skew and
      // stores it separately from its own insert time, so createdAt - loggedAt is the
      // sync lag -- the metric that shows the paper register was actually replaced.
      loggedAt: nowIsoWithOffset(),
    };

    // Durable BEFORE the network.
    await this.outbox.enqueue({
      clientUuid: draft.clientUuid,
      userId,
      kind: 'createInspection',
      payload: draft,
    });

    // Same gesture: try to send it now. This reuses the identical flush and
    // classification path as background syncing, so there is only one place where
    // "what does a 400 mean" is decided.
    await this.requestFlush();

    const record = await this.outbox.get(draft.clientUuid);

    // Gone from the outbox means the flush succeeded and the record was removed.
    if (!record) {
      const synced = await this.findSynced(draft.clientUuid);
      return synced ?? { kind: 'queued', clientUuid: draft.clientUuid };
    }

    // Dead-lettered: the server rejected the payload outright, so telling the user it
    // is "queued" would be a lie -- it will never send on its own.
    if (record.status === OutboxStatus.Failed) {
      throw new LogInspectionFailedError(
        record.lastError.message,
        draft.clientUuid,
      );
    }

    // Still pending or syncing: durably saved on the device, not yet on the server.
    return { kind: 'queued', clientUuid: draft.clientUuid };
  }
}
