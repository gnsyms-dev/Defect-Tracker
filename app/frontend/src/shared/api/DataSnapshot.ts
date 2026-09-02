export interface DataSnapshot<T> {
  readonly data: T;
  readonly fetchedAt: number;
  /** True when this came from IndexedDB rather than the network. */
  readonly isFromCache: boolean;
}

/**
 * Options a caching repository accepts.
 *
 * `onSnapshot` exists because stale-while-revalidate needs the loader to yield
 * TWICE -- the cached value immediately, then the fresh one -- and a Promise can only
 * resolve once. This callback is the minimum machinery required to get SWR without
 * adding a query-cache library whose cache would then duplicate the IndexedDB one we
 * need for offline anyway.
 */
export interface LoadOptions<T> {
  readonly signal?: AbortSignal;
  readonly onSnapshot?: (snapshot: DataSnapshot<T>) => void;
}
