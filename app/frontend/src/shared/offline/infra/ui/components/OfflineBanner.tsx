import { useSyncNow } from '../useSyncStatus';
import { useIsOffline } from '../useConnectivity';
import { useSyncStatus } from '../useSyncStatus';

/**
 * A persistent strip, IN THE LAYOUT FLOW so it pushes content down and hides nothing.
 *
 * Not a toast: the condition persists for as long as the connection is down, so an
 * auto-dismissing affordance would be a lie. aria-live announces the change without
 * stealing focus from whatever the supervisor is typing.
 */
export function OfflineBanner() {
  const isOffline = useIsOffline();
  const { counts, isFlushing } = useSyncStatus();
  const syncNow = useSyncNow();

  if (!isOffline) {
    return null;
  }

  const queued = counts.pending + counts.syncing;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 bg-offline-bg px-4 py-2 text-sm text-offline"
    >
      <span className="font-medium">
        {queued > 0
          ? `Offline — ${queued} saved on this device`
          : 'Offline — showing saved data'}
      </span>
      <button
        type="button"
        onClick={syncNow}
        disabled={isFlushing}
        className="min-h-tap shrink-0 font-semibold underline underline-offset-2 disabled:opacity-60"
      >
        {isFlushing ? 'Syncing…' : 'Retry'}
      </button>
    </div>
  );
}
