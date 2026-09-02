import { InspectionEntity } from '../domain/entities/inspection.entity';
import type {
  InspectionFilters,
  InspectionSort,
  Page,
  Pagination,
} from './inspection-filters.interface';
import type { InspectionScope } from './inspection-scope.type';
import type { InspectionSummaryRow } from './inspection-summary-row.interface';
import { DefectType, Severity } from './inspection.enum';

export const INSPECTIONS_REPOSITORY = Symbol('INSPECTIONS_REPOSITORY');

export interface CreateInspectionData {
  readonly clientUuid: string;
  readonly plantId: string;
  readonly loggedByUserId: string;
  readonly inspectionDate: string;
  readonly machineLineId: string;
  readonly defectType: DefectType;
  readonly severity: Severity;
  readonly remarks: string | null;
  readonly loggedAt: Date;
}

export interface CreateInspectionResult {
  readonly inspection: InspectionEntity;
  /**
   * False when this was a replay of an already-stored client_uuid. The controller
   * turns this into 201 vs 200, which is what lets the offline outbox treat every
   * 2xx identically instead of special-casing a conflict as success.
   */
  readonly wasCreated: boolean;
}

export interface ResolveInspectionData {
  readonly resolutionNote: string;
  readonly resolvedByUserId: string;
  readonly resolvedAt: Date;
}

export interface InspectionsRepositoryPort {
  /**
   * Idempotent create. Inserts, or returns the existing row when
   * (loggedByUserId, clientUuid) is already present.
   */
  createIfAbsent(data: CreateInspectionData): Promise<CreateInspectionResult>;

  // NOTE: every read takes `scope` as its FIRST, REQUIRED parameter. That is
  // deliberate -- it makes an unscoped query fail to compile rather than silently
  // returning another supervisor's rows.
  findMany(
    scope: InspectionScope,
    filters: InspectionFilters,
    sort: InspectionSort,
    pagination: Pagination,
  ): Promise<Page<InspectionEntity>>;

  findById(
    scope: InspectionScope,
    id: string,
  ): Promise<InspectionEntity | null>;

  summarize(
    scope: InspectionScope,
    filters: InspectionFilters,
  ): Promise<readonly InspectionSummaryRow[]>;

  /**
   * Conditional update: only transitions a row that is still `open`.
   * Resolves to null when nothing was updated, which the service then
   * disambiguates into 404 (missing / out of scope) or 409 (already resolved).
   */
  resolveIfOpen(
    scope: InspectionScope,
    id: string,
    data: ResolveInspectionData,
  ): Promise<InspectionEntity | null>;
}
