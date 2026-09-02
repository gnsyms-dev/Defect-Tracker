import { Link } from 'react-router';
import { useSyncStatus } from '../useSyncStatus';

/**
 * A separate, LOUDER banner for dead-lettered entries.
 *
 * Deliberately not the same affordance as the offline banner: pending resolves itself
 * given a connection, whereas failed needs a human to edit or discard it. Making them
 * look alike would train the supervisor to ignore both.
 */
export function FailedSyncBanner() {
  const { counts } = useSyncStatus();

  if (counts.failed === 0) {
    return null;
  }

  return (
    <Link
      to="/pending"
      className="flex items-center justify-between gap-3 bg-danger-bg px-4 py-2 text-sm font-medium text-danger"
    >
      <span>
        {counts.failed === 1
          ? '1 inspection needs attention'
          : `${counts.failed} inspections need attention`}
      </span>
      <span aria-hidden="true" className="shrink-0 font-semibold underline">
        Review
      </span>
    </Link>
  );
}
