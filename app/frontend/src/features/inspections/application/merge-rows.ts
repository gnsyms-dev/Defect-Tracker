import type { OutboxRecord } from '@/shared/offline/application/domain/OutboxRecord';
import type { DraftInspection } from './domain/entities/DraftInspection';
import type { Inspection } from './domain/entities/Inspection';
import type { InspectionListRow } from './domain/entities/InspectionListRow';

export interface MergeRowsInput {
  readonly serverRows: readonly Inspection[];
  readonly outboxRecords: readonly OutboxRecord[];
  readonly currentUserId: string;
  /** Validates a payload read back from IndexedDB, possibly written by an older build. */
  readonly parseDraft: (payload: unknown) => DraftInspection | null;
}

/**
 * Merges locally-queued drafts with server rows into one list, without duplicates.
 *
 * `clientUuid` is the join key, and it works precisely because it is generated BEFORE
 * the server ever sees the record and survives the round trip -- the server echoes it
 * back on every read. Field-matching would be the alternative, and it breaks the
 * moment two identical defects are logged on one machine on one day.
 *
 * Pure, so it is cheap to test exhaustively -- which matters because a bug here shows
 * up as duplicated or vanishing defects, the two things a register must never do.
 */
export function mergeRows(input: MergeRowsInput): readonly InspectionListRow[] {
  const serverKeys = new Set<string>();
  for (const inspection of input.serverRows) {
    if (inspection.clientUuid) {
      serverKeys.add(inspection.clientUuid);
    }
  }

  const localRows: InspectionListRow[] = [];
  for (const record of input.outboxRecords) {
    // Another user's queued work is invisible: a shared shop-floor phone must not
    // leak one supervisor's entries into another's list.
    if (record.userId !== input.currentUserId) {
      continue;
    }
    // Already came back from the server -- drop the local copy rather than showing
    // the same defect twice.
    if (serverKeys.has(record.clientUuid)) {
      continue;
    }
    const draft = input.parseDraft(record.payload);
    if (!draft) {
      continue;
    }

    localRows.push(
      record.status === 'failed'
        ? {
            source: 'local',
            clientUuid: record.clientUuid,
            draft,
            syncState: record.status,
            lastError: record.lastError,
          }
        : {
            source: 'local',
            clientUuid: record.clientUuid,
            draft,
            syncState: record.status,
          },
    );
  }

  // Locals first: what the supervisor just typed belongs at the top, where they can
  // see it was captured.
  localRows.sort((a, b) => {
    if (a.source !== 'local' || b.source !== 'local') return 0;
    return b.draft.loggedAt.localeCompare(a.draft.loggedAt);
  });

  return [
    ...localRows,
    ...input.serverRows.map(
      (inspection): InspectionListRow => ({ source: 'server', inspection }),
    ),
  ];
}
