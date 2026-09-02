import { isApiError, isNetworkError } from '@/shared/api/errors';
import type { FlushOutcome } from '@/shared/offline/application/flush-policy';
import type { OutboxHandler } from '@/shared/offline/application/ports/OutboxHandler';
import type { DraftInspection } from '../application/domain/entities/DraftInspection';
import { draftInspectionSchema } from '../application/validators/draft-inspection.schema';
import type { InspectionRepository } from '../application/ports/InspectionRepository';

export const CREATE_INSPECTION_KIND = 'createInspection';

/**
 * Teaches the generic sync engine how to POST one queued inspection.
 *
 * This is the seam that keeps `shared/offline` from knowing what an inspection is:
 * the engine owns queueing, backoff and error classification; this owns the request.
 * A second offline-capable write would be a new handler, never an edit to the engine.
 */
export class CreateInspectionOutboxHandler implements OutboxHandler<DraftInspection> {
  readonly kind = CREATE_INSPECTION_KIND;
  readonly payloadSchema = draftInspectionSchema;

  private readonly repository: InspectionRepository;
  private readonly onSyncedCallback: () => Promise<void>;

  constructor(params: {
    repository: InspectionRepository;
    onSynced: () => Promise<void>;
  }) {
    this.repository = params.repository;
    this.onSyncedCallback = params.onSynced;
  }

  async flush(payload: DraftInspection): Promise<FlushOutcome> {
    try {
      await this.repository.create(payload);
      // A replay returns 200 with the stored record instead of an error, so there is
      // nothing special to handle here -- which is exactly why the API was designed
      // that way rather than returning 409.
      return { kind: 'ok' };
    } catch (error) {
      return toFlushOutcome(error);
    }
  }

  async onSynced(): Promise<void> {
    await this.onSyncedCallback();
  }
}

/**
 * Translates a thrown error into the shape the pure classifier understands.
 *
 * Keeping this translation here -- rather than letting the engine catch and interpret
 * exception types -- is what allows classifyFlushOutcome to stay a pure function with
 * no knowledge of the HTTP layer.
 */
export function toFlushOutcome(error: unknown): FlushOutcome {
  if (isNetworkError(error)) {
    return { kind: 'network' };
  }

  if (isApiError(error)) {
    // Our own response-shape bug. Must NOT dead-letter the user's inspection.
    if (error.kind === 'contract') {
      return { kind: 'contract', message: error.message };
    }
    if (error.httpStatus !== null) {
      return {
        kind: 'http',
        status: error.httpStatus,
        responseCode: error.responseCode,
        message: error.message,
      };
    }
    // A malformed body with no status: treat as transport-ish and retry rather than
    // destroying the record.
    return { kind: 'network' };
  }

  return {
    kind: 'contract',
    message: error instanceof Error ? error.message : 'Unexpected error',
  };
}
