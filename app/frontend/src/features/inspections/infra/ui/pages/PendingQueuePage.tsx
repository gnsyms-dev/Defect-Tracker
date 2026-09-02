import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDI, useInspectionDeps } from '@/app/di/useAppDI';
import { useAuth } from '@/features/auth/infra/di/useAuth';
import {
  OutboxStatus,
  type OutboxRecord,
} from '@/shared/offline/application/domain/OutboxRecord';
import { SyncStateChip } from '@/shared/offline/infra/ui/components/SyncStateChip';
import { useSyncNow, useSyncStatus } from '@/shared/offline/infra/ui/useSyncStatus';
import { formatCalendarDate, formatTime } from '@/shared/lib/datetime';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Card, EmptyState } from '@/shared/ui/feedback';
import { DEFECT_TYPE_LABELS } from '../../../application/domain/DefectType';
import { SEVERITY_ACCENT_CLASSES, SEVERITY_LABELS } from '../../../application/domain/Severity';
import { parseDraftInspection } from '../../../application/validators/draft-inspection.schema';
import { SeverityBadge } from '../components/SeverityBadge';

/**
 * The dead-letter queue, made visible.
 *
 * This screen is what makes the "never retry a 4xx" rule safe: an entry the server
 * rejected stops retrying, but it is NOT silently dropped -- it lands here with the
 * server's message so a human can retry or discard it deliberately.
 */
export function PendingQueuePage() {
  const { outbox } = useInspectionDeps();
  const { syncEngine } = useAppDI();
  const { userId } = useAuth();
  const syncStatus = useSyncStatus();
  const syncNow = useSyncNow();
  // Stored with the owning user id, so a sign-out is handled by derivation rather than
  // a synchronous setState inside the effect.
  const [loaded, setLoaded] = useState<{
    userId: string | null;
    records: readonly OutboxRecord[];
  }>({ userId: null, records: [] });
  const [discarding, setDiscarding] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) {
      return;
    }
    setLoaded({ userId, records: await outbox.listByUser(userId) });
  }, [outbox, userId]);

  // The promise chain is inlined rather than calling reload(): the state update has to
  // be demonstrably asynchronous, and a call into a helper that *might* set state
  // synchronously is exactly the cascading-render hazard the lint rule guards against.
  // reload() stays for the retry/discard handlers, where a synchronous update is fine.
  useEffect(() => {
    if (!userId) {
      return;
    }
    let isCurrent = true;
    void outbox.listByUser(userId).then((records) => {
      if (isCurrent) {
        setLoaded({ userId, records });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [outbox, userId, syncStatus.counts, syncStatus.lastSyncedAt]);

  const records = useMemo<readonly OutboxRecord[]>(
    () => (userId && loaded.userId === userId ? loaded.records : []),
    [loaded, userId],
  );

  // useCallback, not a plain function: these are event handlers, and hoisting them out
  // of the render body is what keeps Date.now() from being read during render.
  const retry = useCallback(
    async (clientUuid: string): Promise<void> => {
      // Back to pending with the backoff cleared, then flush: an explicit human retry
      // should not have to wait out an exponential delay.
      await outbox.release(clientUuid, Date.now());
      await syncEngine.requestFlush('manual');
      await reload();
    },
    [outbox, reload, syncEngine],
  );

  const discard = useCallback(
    async (clientUuid: string): Promise<void> => {
      await outbox.remove(clientUuid);
      setDiscarding(null);
      await syncEngine.refreshCounts();
      await reload();
    },
    [outbox, reload, syncEngine],
  );

  if (records.length === 0) {
    return (
      <EmptyState
        title="Everything is synced"
        description="Inspections you log without a connection will appear here until they sync."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text">Waiting to sync</h1>
          <p className="text-xs text-text-muted">
            {records.length === 1 ? '1 inspection' : `${records.length} inspections`}{' '}
            saved on this device
          </p>
        </div>
        <Button
          variant="secondary"
          isLoading={syncStatus.isFlushing}
          onClick={syncNow}
        >
          Sync now
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        {records.map((record) => {
          const draft = parseDraftInspection(record.payload);
          if (!draft) {
            return null;
          }
          const isFailed = record.status === OutboxStatus.Failed;

          return (
            <li key={record.clientUuid}>
              <Card
                accentClassName={SEVERITY_ACCENT_CLASSES[draft.severity]}
                className="p-3 pl-4"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={draft.severity} />
                  <SyncStateChip state={record.status} />
                </div>

                <p className="mt-2 text-base font-semibold text-text">
                  {draft.machineLineId}
                </p>
                <p className="text-sm text-text-muted">
                  {DEFECT_TYPE_LABELS[draft.defectType]} ·{' '}
                  {SEVERITY_LABELS[draft.severity]}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {formatCalendarDate(draft.inspectionDate)} · logged{' '}
                  {formatTime(draft.loggedAt)}
                  {record.attempts > 0 ? ` · ${record.attempts} attempt(s)` : ''}
                </p>
                {draft.remarks ? (
                  <p className="mt-1 text-sm text-text-muted">{draft.remarks}</p>
                ) : null}

                {isFailed ? (
                  <p className="mt-2 rounded-control bg-danger-bg px-2 py-1.5 text-xs font-medium text-danger">
                    {record.lastError.message}
                  </p>
                ) : null}

                {isFailed ? (
                  // Retry and Discard are deliberately NOT adjacent: on a gloved hand
                  // at 390px, a mis-tap that destroys a defect record is unacceptable.
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      size="lg"
                      isFullWidth
                      onClick={() => void retry(record.clientUuid)}
                    >
                      Retry
                    </Button>
                    <Button
                      variant="ghost"
                      isFullWidth
                      onClick={() => setDiscarding(record.clientUuid)}
                    >
                      Discard
                    </Button>
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>

      {discarding ? (
        <ConfirmDialog
          title="Discard this inspection?"
          description="It has not reached the server, so discarding removes it permanently. This cannot be undone."
          confirmLabel="Discard permanently"
          cancelLabel="Keep it"
          onConfirm={() => void discard(discarding)}
          onCancel={() => setDiscarding(null)}
        />
      ) : null}
    </div>
  );
}
