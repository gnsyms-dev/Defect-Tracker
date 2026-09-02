import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useInspectionDeps } from '@/app/di/useAppDI';
import type { LoadOptions } from '@/shared/api/DataSnapshot';
import { toUserMessage } from '@/shared/api/errors';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import { canonicalQuery } from '@/shared/api/query-string';
import type { OutboxRecord } from '@/shared/offline/application/domain/OutboxRecord';
import { useSyncStatus } from '@/shared/offline/infra/ui/useSyncStatus';
import { useAuth } from '@/features/auth/infra/di/useAuth';
import { mergeRows } from '../../../application/merge-rows';
import { parseDraftInspection } from '../../../application/validators/draft-inspection.schema';
import type { InspectionListRow } from '../../../application/domain/entities/InspectionListRow';
import type { InspectionPage } from '../../../application/domain/entities/InspectionPage';
import type { InspectionQuery } from '../../../application/domain/entities/InspectionFilters';
import { countActiveFilters } from '../../../application/domain/entities/InspectionFilters';
import { toQueryParams } from '../../repositories/ApiInspectionRepository';
import {
  filtersFromSearchParams,
  searchParamsFromFilters,
} from '../filters-search-params';

export interface InspectionListViewModel {
  readonly rows: readonly InspectionListRow[];
  readonly query: InspectionQuery;
  readonly total: number;
  readonly loadedCount: number;
  readonly hasMore: boolean;
  readonly activeFilterCount: number;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly error: string | null;
  readonly fetchedAt: number | null;
  readonly isFromCache: boolean;
  loadMore(): void;
  reload(): void;
  setSort(sortBy: InspectionQuery['sortBy'], sortDir: InspectionQuery['sortDir']): void;
  clearFilters(): void;
  removeFilter(key: keyof InspectionQuery): void;
}

export function useInspectionListViewModel(): InspectionListViewModel {
  const { inspectionRepository, outbox } = useInspectionDeps();
  const { userId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const syncStatus = useSyncStatus();

  const query = useMemo(
    () => filtersFromSearchParams(searchParams),
    [searchParams],
  );

  const baseKey = canonicalQuery(toQueryParams({ ...query, page: 1 }));

  // "Load more" accumulates pages rather than replacing them: a numbered pager at
  // 390px is a row of 44px targets that does not fit.
  //
  // The accumulated size is stored WITH the query it belongs to, so changing filters
  // resets it by derivation rather than by a setState inside an effect (which would
  // cause a cascading render and a wasted fetch at the old size).
  const [accumulated, setAccumulated] = useState<{ key: string; limit: number }>({
    key: baseKey,
    limit: query.limit,
  });
  const limit = accumulated.key === baseKey ? accumulated.limit : query.limit;

  const effectiveQuery = useMemo<InspectionQuery>(
    () => ({ ...query, page: 1, limit }),
    [query, limit],
  );

  // The cache key changes with the query, which is what makes useAsyncData refetch.
  const queryKey = canonicalQuery(toQueryParams(effectiveQuery));

  const loader = useCallback(
    (options: LoadOptions<InspectionPage>) =>
      inspectionRepository.list(effectiveQuery, options),
    [effectiveQuery, inspectionRepository],
  );

  const page = useAsyncData<InspectionPage>(`list:${queryKey}`, loader);

  // Locally-queued rows, re-read whenever the outbox changes. The counts in
  // syncStatus are the trigger: they change on every enqueue, flush and dead-letter.
  //
  // Stored with the owning user id so signing out is handled by derivation rather than
  // a synchronous setState in the effect -- another user's queued work must never be
  // rendered even for a frame.
  const [loadedOutbox, setLoadedOutbox] = useState<{
    userId: string | null;
    records: readonly OutboxRecord[];
  }>({ userId: null, records: [] });

  useEffect(() => {
    if (!userId) {
      return;
    }
    let isCurrent = true;
    void outbox.listByUser(userId).then((records) => {
      if (isCurrent) {
        setLoadedOutbox({ userId, records });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [outbox, userId, syncStatus.counts, syncStatus.lastSyncedAt]);

  // Memoised so the empty-array fallback keeps a stable identity and does not
  // invalidate the merge memo below on every render.
  const outboxRecords = useMemo<readonly OutboxRecord[]>(
    () => (userId && loadedOutbox.userId === userId ? loadedOutbox.records : []),
    [loadedOutbox, userId],
  );

  const rows = useMemo(() => {
    const serverRows = page.data?.items ?? [];
    if (!userId) {
      return serverRows.map(
        (inspection): InspectionListRow => ({ source: 'server', inspection }),
      );
    }
    // Only the unfiltered view merges local drafts. A queued row has never been near
    // the server, so it cannot honestly be claimed to match a server-side filter --
    // showing it under one would be a plausible-looking lie.
    if (countActiveFilters(query) > 0) {
      return serverRows.map(
        (inspection): InspectionListRow => ({ source: 'server', inspection }),
      );
    }
    return mergeRows({
      serverRows,
      outboxRecords,
      currentUserId: userId,
      parseDraft: parseDraftInspection,
    });
  }, [outboxRecords, page.data, query, userId]);

  const updateParams = useCallback(
    (next: Partial<InspectionQuery>) => {
      setSearchParams(searchParamsFromFilters({ ...query, ...next }), {
        replace: true,
      });
    },
    [query, setSearchParams],
  );

  return {
    rows,
    query: effectiveQuery,
    total: page.data?.total ?? 0,
    loadedCount: page.data?.items.length ?? 0,
    hasMore: (page.data?.items.length ?? 0) < (page.data?.total ?? 0),
    activeFilterCount: countActiveFilters(query),
    isLoading: page.isLoading,
    isRefreshing: page.isRefreshing,
    error: page.error ? toUserMessage(page.error) : null,
    fetchedAt: page.fetchedAt,
    isFromCache: page.isFromCache,
    loadMore: () =>
      setAccumulated({ key: baseKey, limit: limit + query.limit }),
    reload: page.reload,
    setSort: (sortBy, sortDir) => updateParams({ sortBy, sortDir }),
    clearFilters: () =>
      setSearchParams(
        searchParamsFromFilters({ sortBy: query.sortBy, sortDir: query.sortDir }),
        { replace: true },
      ),
    removeFilter: (key) => updateParams({ [key]: undefined }),
  };
}
