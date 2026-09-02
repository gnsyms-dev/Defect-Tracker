import { useCallback, useEffect, useState } from 'react';
import type { DataSnapshot, LoadOptions } from '@/shared/api/DataSnapshot';

export interface AsyncDataState<T> {
  readonly data: T | null;
  /** No data to show yet. */
  readonly isLoading: boolean;
  /** Showing data while a fresh fetch is in flight. */
  readonly isRefreshing: boolean;
  readonly error: unknown;
  readonly fetchedAt: number | null;
  readonly isFromCache: boolean;
}

export interface AsyncDataResult<T> extends AsyncDataState<T> {
  readonly reload: () => void;
}

interface Settled<T> {
  readonly key: string;
  readonly data: T | null;
  readonly error: unknown;
  readonly fetchedAt: number | null;
  readonly isFromCache: boolean;
}

/**
 * The whole of our "query library", at about 90 lines.
 *
 * Deliberately not TanStack Query. The offline requirement forces us to own an
 * IndexedDB store regardless, so adding a query cache would mean TWO caches of the
 * same rows with two lifetimes -- and the merged list has to read pending items from
 * IndexedDB, so it would be assembled from two sources of truth. Caching inside the
 * repository instead keeps one source, and keeps the cache visible to the sync engine
 * (which is not a React hook and could not read a hook-layer cache).
 *
 * `key` is explicit rather than a dependency array. It identifies the request, which
 * lets loading and refreshing be DERIVED by comparing it with the last settled key --
 * so this hook never calls setState synchronously inside its effect, and never needs a
 * ref written during render. Callers already have a natural key (the canonical query
 * string, or a record id), and passing it makes the cache-key coupling visible.
 *
 * What we give up, honestly: window-focus refetch, automatic request dedup, and
 * cross-component cache sharing. At three read screens with one consumer each, that is
 * a fair trade -- and because everything goes through a repository port, a query
 * library could later be introduced INSIDE the implementation without touching a
 * single view-model.
 */
export function useAsyncData<T>(
  key: string,
  loader: (options: LoadOptions<T>) => Promise<T>,
): AsyncDataResult<T> {
  const [reloadToken, setReloadToken] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const requestKey = `${key}#${reloadToken}`;

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    // A cache hit resolves this before the network does, which is what paints the
    // screen with no spinner.
    const onSnapshot = (snapshot: DataSnapshot<T>): void => {
      if (!isCurrent) {
        return;
      }
      setSettled({
        // Not the request key: a cached snapshot is not the final answer, so the
        // network attempt still counts as refreshing.
        key: `${requestKey}:cache`,
        data: snapshot.data,
        error: null,
        fetchedAt: snapshot.fetchedAt,
        isFromCache: snapshot.isFromCache,
      });
    };

    void loader({ signal: controller.signal, onSnapshot })
      .then((data) => {
        if (!isCurrent) {
          return;
        }
        setSettled({
          key: requestKey,
          data,
          error: null,
          fetchedAt: Date.now(),
          isFromCache: false,
        });
      })
      .catch((error: unknown) => {
        if (!isCurrent || controller.signal.aborted) {
          return;
        }
        setSettled((previous) => ({
          key: requestKey,
          // The error is surfaced WITHOUT discarding data we already have: offline
          // should show the last known list plus a banner, never an empty screen.
          data: previous?.data ?? null,
          error,
          fetchedAt: previous?.fetchedAt ?? null,
          isFromCache: previous?.isFromCache ?? false,
        }));
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [loader, requestKey]);

  const hasSettledThisRequest = settled?.key === requestKey;
  const data = settled?.data ?? null;

  return {
    data,
    isLoading: !hasSettledThisRequest && data === null,
    isRefreshing: !hasSettledThisRequest && data !== null,
    error: hasSettledThisRequest ? settled.error : null,
    fetchedAt: settled?.fetchedAt ?? null,
    isFromCache: settled?.isFromCache ?? false,
    reload,
  };
}
