import { describe, expect, it } from 'vitest';
import {
  OutboxStatus,
  type OutboxRecord,
} from '@/shared/offline/application/domain/OutboxRecord';
import { DefectType } from './domain/DefectType';
import { InspectionStatus } from './domain/InspectionStatus';
import { Severity } from './domain/Severity';
import type { DraftInspection } from './domain/entities/DraftInspection';
import type { Inspection } from './domain/entities/Inspection';
import { mergeRows } from './merge-rows';

const USER = 'sup-1';

function draft(clientUuid: string, loggedAt = '2026-09-01T10:00:00+05:30'): DraftInspection {
  return {
    clientUuid,
    inspectionDate: '2026-09-01',
    machineLineId: 'LOOMA-004',
    defectType: DefectType.WeaveDefect,
    severity: Severity.Major,
    remarks: null,
    loggedAt,
  };
}

function outbox(
  clientUuid: string,
  overrides: Partial<Pick<OutboxRecord, 'userId' | 'status'>> & {
    loggedAt?: string;
  } = {},
): OutboxRecord {
  const base = {
    clientUuid,
    userId: overrides.userId ?? USER,
    kind: 'createInspection',
    payload: draft(clientUuid, overrides.loggedAt),
    createdAt: 1,
    updatedAt: 1,
    attempts: 0,
  };
  if (overrides.status === OutboxStatus.Failed) {
    return {
      ...base,
      status: OutboxStatus.Failed,
      lastError: { kind: 'validation', message: 'remarks required', at: 1 },
      failedAt: 1,
    };
  }
  if (overrides.status === OutboxStatus.Syncing) {
    return { ...base, status: OutboxStatus.Syncing, claimedAt: 1 };
  }
  return { ...base, status: OutboxStatus.Pending, nextAttemptAt: 0 };
}

function server(id: string, clientUuid: string): Inspection {
  return {
    id,
    clientUuid,
    inspectionDate: '2026-09-01',
    machineLineId: 'LOOMA-004',
    defectType: DefectType.WeaveDefect,
    severity: Severity.Major,
    status: InspectionStatus.Open,
    remarks: null,
    resolutionNote: null,
    resolvedBy: null,
    resolvedAt: null,
    loggedBy: { id: USER, fullName: 'Rakesh Patel' },
    plant: { id: 'p1', code: 'GJ-SUR-01', name: 'Surat Weaving Unit 1' },
    loggedAt: '2026-09-01T10:00:00+05:30',
    createdAt: '2026-09-01T10:00:05+05:30',
    syncLagSeconds: 5,
  };
}

const parseDraft = (payload: unknown): DraftInspection | null =>
  payload as DraftInspection;

describe('mergeRows', () => {
  it('returns server rows alone when the outbox is empty', () => {
    const rows = mergeRows({
      serverRows: [server('i1', 'c1')],
      outboxRecords: [],
      currentUserId: USER,
      parseDraft,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('server');
  });

  it('returns local rows alone when the server has none', () => {
    const rows = mergeRows({
      serverRows: [],
      outboxRecords: [outbox('c1')],
      currentUserId: USER,
      parseDraft,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('local');
  });

  it('DEDUPES by clientUuid once a queued row comes back from the server', () => {
    // The money test: without this the supervisor sees their defect twice the moment
    // it syncs, which reads as data corruption in a register.
    const rows = mergeRows({
      serverRows: [server('i1', 'c1')],
      outboxRecords: [outbox('c1')],
      currentUserId: USER,
      parseDraft,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('server');
  });

  it('keeps a local row whose clientUuid is not yet on the server', () => {
    const rows = mergeRows({
      serverRows: [server('i1', 'c1')],
      outboxRecords: [outbox('c2')],
      currentUserId: USER,
      parseDraft,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].source).toBe('local');
    expect(rows[1].source).toBe('server');
  });

  it('HIDES another user\'s queued rows (shared shop-floor device)', () => {
    const rows = mergeRows({
      serverRows: [],
      outboxRecords: [outbox('c1', { userId: 'sup-2' }), outbox('c2')],
      currentUserId: USER,
      parseDraft,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].source === 'local' && rows[0].clientUuid).toBe('c2');
  });

  it('sorts local rows before server rows, newest local first', () => {
    const rows = mergeRows({
      serverRows: [server('i1', 'cS')],
      outboxRecords: [
        outbox('cOld', { loggedAt: '2026-09-01T08:00:00+05:30' }),
        outbox('cNew', { loggedAt: '2026-09-01T11:00:00+05:30' }),
      ],
      currentUserId: USER,
      parseDraft,
    });

    expect(rows.map((row) => (row.source === 'local' ? row.clientUuid : 'SERVER'))).toEqual([
      'cNew',
      'cOld',
      'SERVER',
    ]);
  });

  it('carries the sync state so the row can be badged', () => {
    const rows = mergeRows({
      serverRows: [],
      outboxRecords: [
        outbox('c1', { status: OutboxStatus.Pending }),
        outbox('c2', { status: OutboxStatus.Syncing }),
        outbox('c3', { status: OutboxStatus.Failed }),
      ],
      currentUserId: USER,
      parseDraft,
    });

    const states = rows.map((row) => (row.source === 'local' ? row.syncState : null));
    expect(new Set(states)).toEqual(new Set(['pending', 'syncing', 'failed']));
  });

  it('attaches lastError only to failed rows', () => {
    const rows = mergeRows({
      serverRows: [],
      outboxRecords: [
        outbox('c1', { status: OutboxStatus.Pending }),
        outbox('c2', { status: OutboxStatus.Failed }),
      ],
      currentUserId: USER,
      parseDraft,
    });

    for (const row of rows) {
      if (row.source !== 'local') continue;
      if (row.syncState === 'failed') {
        expect(row.lastError?.message).toBe('remarks required');
      } else {
        expect(row.lastError).toBeUndefined();
      }
    }
  });

  it('drops a queued record whose payload no longer parses', () => {
    // A record written by an older build must not crash the list.
    const rows = mergeRows({
      serverRows: [],
      outboxRecords: [outbox('c1')],
      currentUserId: USER,
      parseDraft: () => null,
    });

    expect(rows).toHaveLength(0);
  });

  it('tolerates a server row with an empty clientUuid without dropping local rows', () => {
    const withoutKey = { ...server('i1', 'c1'), clientUuid: '' };
    const rows = mergeRows({
      serverRows: [withoutKey],
      outboxRecords: [outbox('c1')],
      currentUserId: USER,
      parseDraft,
    });

    // No usable join key on the server row, so the local one is kept rather than
    // silently discarded.
    expect(rows).toHaveLength(2);
  });
});
