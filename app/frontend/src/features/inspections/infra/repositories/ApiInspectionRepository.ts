import { z } from 'zod';
import type { HttpClient } from '@/shared/api/HttpClient';
import type { QueryParams } from '@/shared/api/query-string';
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
  inspectionDtoSchema,
  inspectionPageDtoSchema,
  inspectionSummaryDtoSchema,
  type ResolveInspectionRequestDto,
} from '../dto/InspectionDto';
import { InspectionMapper } from '../dto/InspectionMapper';

export class ApiInspectionRepository implements InspectionRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async list(query: InspectionQuery): Promise<InspectionPage> {
    const dto = await this.http.request(
      { path: '/inspections', query: toQueryParams(query) },
      inspectionPageDtoSchema,
    );
    return InspectionMapper.toPage(dto);
  }

  async getById(id: string): Promise<Inspection> {
    const dto = await this.http.request(
      { path: `/inspections/${id}` },
      inspectionDtoSchema,
    );
    return InspectionMapper.toDomain(dto);
  }

  async create(draft: DraftInspection): Promise<Inspection> {
    // The API answers 201 for a genuine insert and 200 for a replay of the same
    // clientUuid, with an IDENTICAL body -- so a single mapping handles both and the
    // caller needs no branch. That symmetry is what makes retrying a create safe.
    const dto = await this.http.request(
      {
        path: '/inspections',
        method: 'POST',
        body: InspectionMapper.toCreateRequest(draft),
      },
      inspectionDtoSchema,
    );
    return InspectionMapper.toDomain(dto);
  }

  async resolve(id: string, resolutionNote: string): Promise<Inspection> {
    const body: ResolveInspectionRequestDto = { resolutionNote };
    const dto = await this.http.request(
      { path: `/inspections/${id}/resolve`, method: 'PATCH', body },
      inspectionDtoSchema,
    );
    return InspectionMapper.toDomain(dto);
  }

  async summary(filters: InspectionFilters): Promise<InspectionSummary> {
    const dto = await this.http.request(
      { path: '/inspections/summary', query: toQueryParams(filters) },
      inspectionSummaryDtoSchema,
    );
    return InspectionMapper.toSummary(dto);
  }
}

/** Exposed for the caching decorator, which keys its cache on the same params. */
export function toQueryParams(
  source: InspectionFilters & Partial<InspectionQuery>,
): QueryParams {
  return {
    severity: source.severity ? [...source.severity] : undefined,
    status: source.status,
    defectType: source.defectType ? [...source.defectType] : undefined,
    dateFrom: source.dateFrom,
    dateTo: source.dateTo,
    plantId: source.plantId,
    machineLineId: source.machineLineId,
    sortBy: source.sortBy,
    sortDir: source.sortDir,
    page: source.page,
    limit: source.limit,
  };
}

/** Used by the cache layer to validate what it reads back out of IndexedDB. */
export const cachedPageSchema = z.object({
  items: z.array(inspectionDtoSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});
