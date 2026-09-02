import type { LoadOptions } from '@/shared/api/DataSnapshot';
import { isNetworkError } from '@/shared/api/errors';
import type { HttpClient } from '@/shared/api/HttpClient';
import { CacheKind, type CacheStore } from '@/shared/offline/application/ports/CacheStore';
import type { Plant } from '../../application/domain/entities/Plant';
import type { PlantRepository } from '../../application/ports/PlantRepository';
import { plantListDtoSchema } from '../dto/PlantDto';
import { PlantMapper } from '../dto/PlantMapper';

/** Plants change about never, so a long TTL is safe and keeps the filter usable offline. */
const PLANTS_TTL_MS = 24 * 60 * 60 * 1000;

export class ApiPlantRepository implements PlantRepository {
  private readonly http: HttpClient;
  private readonly cache: CacheStore;
  private readonly getViewerId: () => string | null;

  constructor(params: {
    http: HttpClient;
    cache: CacheStore;
    getViewerId: () => string | null;
  }) {
    this.http = params.http;
    this.cache = params.cache;
    this.getViewerId = params.getViewerId;
  }

  async listActive(
    options?: LoadOptions<readonly Plant[]>,
  ): Promise<readonly Plant[]> {
    const viewerId = this.getViewerId();

    if (viewerId) {
      const cached = await this.cache.read(
        viewerId,
        CacheKind.Plants,
        '',
        plantListDtoSchema,
      );

      if (cached) {
        options?.onSnapshot?.({
          data: PlantMapper.toDomainList(cached.data),
          fetchedAt: cached.fetchedAt,
          isFromCache: true,
        });
        // Still fresh: skip the request entirely rather than spending a round trip on
        // reference data that has not changed.
        if (Date.now() - cached.fetchedAt < PLANTS_TTL_MS) {
          return PlantMapper.toDomainList(cached.data);
        }
      }

      try {
        const dtos = await this.http.request({ path: '/plants' }, plantListDtoSchema);
        await this.cache.write(viewerId, CacheKind.Plants, '', dtos);
        return PlantMapper.toDomainList(dtos);
      } catch (error) {
        if (isNetworkError(error) && cached) {
          return PlantMapper.toDomainList(cached.data);
        }
        throw error;
      }
    }

    const dtos = await this.http.request({ path: '/plants' }, plantListDtoSchema);
    return PlantMapper.toDomainList(dtos);
  }
}
