import { useState } from 'react';
import { useAppDI } from '@/app/di/useAppDI';
import { roleLabel } from '@/features/auth/application/domain/UserRole';
import { formatFetchedAt } from '@/shared/lib/datetime';
import { useIsOffline } from '@/shared/offline/infra/ui/useConnectivity';
import { useSyncNow, useSyncStatus } from '@/shared/offline/infra/ui/useSyncStatus';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/feedback';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useAuth } from '../../di/useAuth';

export function AccountPage() {
  const { session, logout } = useAuth();
  const { cache } = useAppDI();
  const { counts, lastSyncedAt, isFlushing } = useSyncStatus();
  const syncNow = useSyncNow();
  const isOffline = useIsOffline();
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);

  if (session.status !== 'authenticated' && session.status !== 'expired') {
    return null;
  }
  const user = session.user;
  const unsynced = counts.pending + counts.syncing + counts.failed;

  const performLogout = (): void => {
    // The CACHE is cleared on sign-out -- it is a refetchable convenience and the
    // privacy exposure on a shared device. The OUTBOX is deliberately NOT: it holds
    // the only copy of unsynced inspections, and destroying it would be the paper
    // register in the bin. Those records stay, invisible to the next user, and flush
    // when their owner signs back in here.
    void cache.invalidateViewer(user.id);
    logout();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold text-text">Account</h1>

      <Card className="divide-y divide-border">
        <Row label="Name" value={user.fullName} />
        <Row label="Email" value={user.email} />
        <Row label="Role" value={roleLabel(user.role)} />
        <Row label="Plant" value={user.plant ? `${user.plant.code} — ${user.plant.name}` : '—'} />
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-text">Sync</h2>
        <dl className="mt-2 space-y-1 text-sm text-text-muted">
          <div className="flex justify-between gap-2">
            <dt>Connection</dt>
            <dd className="font-medium text-text">{isOffline ? 'Offline' : 'Online'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Waiting to sync</dt>
            <dd className="font-medium text-text">{counts.pending + counts.syncing}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Needs attention</dt>
            <dd className="font-medium text-text">{counts.failed}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Last synced</dt>
            <dd className="font-medium text-text">
              {lastSyncedAt ? formatFetchedAt(lastSyncedAt) : 'Not yet'}
            </dd>
          </div>
        </dl>

        <Button
          variant="secondary"
          isFullWidth
          className="mt-3"
          isLoading={isFlushing}
          onClick={syncNow}
        >
          Sync now
        </Button>
      </Card>

      <Button
        variant="secondary"
        size="lg"
        isFullWidth
        onClick={() => {
          // Unsynced work turns sign-out into a decision, not a reflex.
          if (unsynced > 0) {
            setIsConfirmingLogout(true);
            return;
          }
          performLogout();
        }}
      >
        Sign out
      </Button>

      {isConfirmingLogout ? (
        <ConfirmDialog
          title="Unsynced inspections"
          description={
            unsynced === 1
              ? "1 inspection hasn't synced yet. It stays saved on this device and will sync next time you sign in here."
              : `${unsynced} inspections haven't synced yet. They stay saved on this device and will sync next time you sign in here.`
          }
          confirmLabel="Sync now"
          secondaryLabel="Sign out anyway"
          cancelLabel="Stay signed in"
          isConfirmLoading={isFlushing}
          onConfirm={() => {
            syncNow();
            setIsConfirmingLogout(false);
          }}
          // Allowed, behind an explicit confirm: on a shared phone the handover may
          // itself happen in a dead zone, and a hard block would strand the device.
          onSecondary={performLogout}
          onCancel={() => setIsConfirmingLogout(false)}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-right text-sm font-medium text-text">{value}</span>
    </div>
  );
}
