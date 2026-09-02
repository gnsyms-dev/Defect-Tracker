import type { z } from 'zod';
import type { LoadOptions } from '@/shared/api/DataSnapshot';
import { isNetworkError } from '@/shared/api/errors';
import { canonicalQuery } from '@/shared/api/query-string';
import { CacheKind, type CacheStore } from '@/shared/offline/application/ports/CacheStore';
import type { DraftInspection } from '../../application/domain/entities/DraftInspection';
import type { Inspection } from '../../application/domain/entities/Inspection';
import type {
  InspectionFilters,
  InspectionQuery,
} from '../../application/domain/entities/InspectionFilters';
import type { InspectionPage } from '../../application/domain/entities/InspectionPage';
import type { InspectionSummary } from '../../application/domain/entities/InspectionSummary';
import type { InspectionRepository } from '../../application/ports/InspectionRepository';
import {
  inspectionPageDtoSchema,
  inspectionSummaryDtoSchema,
} from '../dto/InspectionDto';
import { InspectionMapper } from '../dto/InspectionMapper';
import { toQueryParams } from './ApiInspectionRepository';

/** Controls only staleness reporting, never whether the cache is DISPLAYED. */
export const LIST_TTL_MS = 60_000;

/**
 * Adds stale-while-revalidate caching over another InspectionRepository.
 *
 * A decorator, and this is where dependency inversion does real work rather than
 * ceremony: it implements the same port, so use-cases and view-models never learn
 * that caching or offline reads exist. Offline is one substitutable implementation.
 *
 * Caching at the REPOSITORY seam (rather than in a hook) is deliberate: the sync
 * engine is not a React hook and could not read a hook-layer cache, and the cache
 * must be visible to it so a successful flush can invalidate the right entries.
 */
export class CachedInspectionRepository implements InspectionRepository {
  private readonly inner: InspectionRepository;
  private readonly cache: CacheStore;
  private readonly getViewerId: () => string | null;

  constructor(params: {
    inner: InspectionRepository;
    cache: CacheStore;
    getViewerId: () => string | null;
  }) {
    this.inner = params.inner;
    this.cache = params.cache;
    this.getViewerId = params.getViewerId;
  }

  async list(
    query: InspectionQuery,
    options?: LoadOptions<InspectionPage>,
  ): Promise<InspectionPage> {
    return this.readThrough({
      kind: CacheKind.InspectionPage,
      query: canonicalQuery(toQueryParams(query)),
      schema: inspectionPageDtoSchema,
      toDomain: (dto) => InspectionMapper.toPage(dto),
      fetch: () => this.inner.list(query),
      toCacheable: (page) => toCacheablePage(page),
      options,
    });
  }

  async summary(
    filters: InspectionFilters,
    options?: LoadOptions<InspectionSummary>,
  ): Promise<InspectionSummary> {
    return this.readThrough({
      kind: CacheKind.Summary,
      query: canonicalQuery(toQueryParams(filters)),
      schema: inspectionSummaryDtoSchema,
      toDomain: (dto) => InspectionMapper.toSummary(dto),
      fetch: () => this.inner.summary(filters),
      toCacheable: (summary) => summary,
      options,
    });
  }

  async getById(id: string): Promise<Inspection> {
    // Not cached: a detail view is always reached from a list that was just loaded,
    // and caching every id is unbounded for no real benefit.
    return this.inner.getById(id);
  }

  async create(draft: DraftInspection): Promise<Inspection> {
    const inspection = await this.inner.create(draft);
    await this.invalidateLists();
    return inspection;
  }

  async resolve(id: string, resolutionNote: string): Promise<Inspection> {
    const inspection = await this.inner.resolve(id, resolutionNote);
    // Resolve changes both the list rows and every summary bucket, and since resolve
    // is online-only we can simply drop the affected entries and let the next read
    // refetch -- which is why a normalised cache would have been over-engineering.
    await this.invalidateLists();
    return inspection;
  }

  async invalidateLists(): Promise<void> {
    const viewerId = this.getViewerId();
    if (!viewerId) {
      return;
    }
    await this.cache.invalidateKinds(viewerId, [
      CacheKind.InspectionPage,
      CacheKind.Summary,
    ]);
  }

  /**
   * The SWR read: emit the cached value immediately if present, then resolve with the
   * network result.
   *
   * Three behaviours worth noting:
   *  - A cache hit paints with NO spinner, which is what makes reopening the app feel
   *    instant on a slow connection.
   *  - A NetworkError keeps the cached data on screen and lets the caller show an
   *    offline banner. It never blanks the screen.
   *  - A cache miss AND a network failure rethrows, so the UI can show an explicit
   *    "no saved data" state rather than spinning forever.
   */
  private async readThrough<TDto, TDomain>(params: {
    kind: CacheKind;
    query: string;
    schema: z.ZodType<TDto>;
    toDomain: (dto: TDto) => TDomain;
    fetch: () => Promise<TDomain>;
    toCacheable: (domain: TDomain) => unknown;
    options?: LoadOptions<TDomain>;
  }): Promise<TDomain> {
    const viewerId = this.getViewerId();

    if (viewerId) {
      const cached = await this.cache.read(
        viewerId,
        params.kind,
        params.query,
        params.schema,
      );
      if (cached) {
        params.options?.onSnapshot?.({
          // No cast: cache.read() validated against the same schema, so `data` is
          // already TDto rather than something we are asserting about.
          data: params.toDomain(cached.data),
          fetchedAt: cached.fetchedAt,
          isFromCache: true,
        });
      }

      try {
        const fresh = await params.fetch();
        await this.cache.write(
          viewerId,
          params.kind,
          params.query,
          params.toCacheable(fresh),
        );
        return fresh;
      } catch (error) {
        // Offline with a cache hit: keep showing what we have. The caller learns about
        // the failure from the connectivity banner, not from an empty screen.
        if (isNetworkError(error) && cached) {
          return params.toDomain(cached.data);
        }
        throw error;
      }
    }

    return params.fetch();
  }
}

/**
 * Re-serialises a domain page into the DTO shape before caching.
 *
 * Caching the DTO rather than the domain object keeps the stored representation
 * aligned with the schema that validates it on read, so a domain refactor cannot
 * silently invalidate every cached entry.
 */
function toCacheablePage(page: InspectionPage): unknown {
  return {
    items: page.items.map((inspection) => ({
      id: inspection.id,
      clientUuid: inspection.clientUuid,
      inspectionDate: inspection.inspectionDate,
      machineLineId: inspection.machineLineId,
      defectType: inspection.defectType,
      severity: inspection.severity,
      status: inspection.status,
      remarks: inspection.remarks,
      resolutionNote: inspection.resolutionNote,
      resolvedBy: inspection.resolvedBy,
      resolvedAt: inspection.resolvedAt,
      loggedBy: inspection.loggedBy,
      plant: inspection.plant,
      loggedAt: inspection.loggedAt,
      createdAt: inspection.createdAt,
      syncLagSeconds: inspection.syncLagSeconds,
    })),
    total: page.total,
    page: page.page,
    limit: page.limit,
    totalPages: page.totalPages,
  };
}
