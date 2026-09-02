import { formatFetchedAt } from '@/shared/lib/datetime';

export interface StaleDataNoticeProps {
  readonly fetchedAt: number | null;
  readonly isFromCache: boolean;
  readonly onRetry: () => void;
}

/**
 * One muted line telling the user the data on screen is not live.
 *
 * Shown only when it is actually cached -- a permanent "last updated" line would be
 * noise. Uses a real <time> element so the timestamp is announced properly.
 */
export function StaleDataNotice({
  fetchedAt,
  isFromCache,
  onRetry,
}: StaleDataNoticeProps) {
  if (!isFromCache || fetchedAt === null) {
    return null;
  }

  return (
    <p className="flex items-center gap-2 px-4 py-1.5 text-xs text-text-muted">
      <span>
        Showing data from{' '}
        <time dateTime={new Date(fetchedAt).toISOString()}>
          {formatFetchedAt(fetchedAt)}
        </time>
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="font-semibold underline underline-offset-2"
      >
        Refresh
      </button>
    </p>
  );
}
