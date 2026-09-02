import type { z } from 'zod';

export const CacheKind = {
  InspectionPage: 'inspectionPage',
  Summary: 'summary',
  Plants: 'plants',
} as const;
export type CacheKind = (typeof CacheKind)[keyof typeof CacheKind];

export interface CacheEntry<T> {
  readonly data: T;
  readonly fetchedAt: number;
}

export interface CacheStore {
  /**
   * Reads and VALIDATES with the given schema.
   *
   * Validation is not optional here: a cached record may have been written by a
   * previous deploy of the app, so what comes out of IndexedDB is genuinely
   * `unknown`. An invalid entry is dropped and treated as a miss rather than
   * crashing a screen.
   */
  read<T>(
    viewerId: string,
    kind: CacheKind,
    query: string,
    schema: z.ZodType<T>,
  ): Promise<CacheEntry<T> | null>;

  write(
    viewerId: string,
    kind: CacheKind,
    query: string,
    data: unknown,
  ): Promise<void>;

  /** After a successful create or resolve -- those invalidate lists and summaries. */
  invalidateKinds(viewerId: string, kinds: readonly CacheKind[]): Promise<void>;

  /** On logout: the cache is a refetchable convenience AND a privacy exposure. */
  invalidateViewer(viewerId: string): Promise<void>;

  /** Drops entries older than the cutoff, across all viewers. */
  sweep(olderThan: number): Promise<number>;
}
