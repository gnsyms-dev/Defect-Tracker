import type { DraftInspection } from '../../application/domain/entities/DraftInspection';
import type {
  Inspection,
  InspectionActor,
  InspectionPlant,
} from '../../application/domain/entities/Inspection';
import type { InspectionPage } from '../../application/domain/entities/InspectionPage';
import type { InspectionSummary } from '../../application/domain/entities/InspectionSummary';
import type {
  CreateInspectionRequestDto,
  InspectionDto,
  InspectionPageDto,
  InspectionSummaryDto,
} from './InspectionDto';

/** The single boundary between the API's shape and the domain's. */
export class InspectionMapper {
  static toDomain(dto: InspectionDto): Inspection {
    return {
      id: dto.id,
      clientUuid: dto.clientUuid,
      inspectionDate: dto.inspectionDate,
      machineLineId: dto.machineLineId,
      defectType: dto.defectType,
      severity: dto.severity,
      status: dto.status,
      // The API omits nulls in some shapes and sends null in others; normalise both
      // to null so no component ever has to check for undefined.
      remarks: dto.remarks ?? null,
      resolutionNote: dto.resolutionNote ?? null,
      resolvedBy: dto.resolvedBy ? InspectionMapper.toActor(dto.resolvedBy) : null,
      resolvedAt: dto.resolvedAt ?? null,
      loggedBy: dto.loggedBy ? InspectionMapper.toActor(dto.loggedBy) : null,
      plant: dto.plant ? InspectionMapper.toPlant(dto.plant) : null,
      loggedAt: dto.loggedAt,
      createdAt: dto.createdAt,
      syncLagSeconds: dto.syncLagSeconds,
    };
  }

  static toPage(dto: InspectionPageDto): InspectionPage {
    return {
      items: dto.items.map((item) => InspectionMapper.toDomain(item)),
      total: dto.total,
      page: dto.page,
      limit: dto.limit,
      totalPages: dto.totalPages,
    };
  }

  static toSummary(dto: InspectionSummaryDto): InspectionSummary {
    return {
      totals: { ...dto.totals },
      bySeverity: dto.bySeverity.map((entry) => ({
        severity: entry.severity,
        open: entry.open,
        resolved: entry.resolved,
        total: entry.total,
      })),
      byPlant: dto.byPlant.map((entry) => ({
        plantId: entry.plantId,
        plant: entry.plant ? InspectionMapper.toPlant(entry.plant) : null,
        open: entry.open,
        resolved: entry.resolved,
        total: entry.total,
      })),
    };
  }

  /**
   * Domain -> request. Runs at FLUSH time, not at enqueue time, which is why a draft
   * queued by an older build still posts correctly after the request shape changes.
   */
  static toCreateRequest(draft: DraftInspection): CreateInspectionRequestDto {
    return {
      clientUuid: draft.clientUuid,
      inspectionDate: draft.inspectionDate,
      loggedAt: draft.loggedAt,
      machineLineId: draft.machineLineId,
      defectType: draft.defectType,
      severity: draft.severity,
      // Omitted rather than sent as null: the API's DTO marks it optional, and
      // forbidNonWhitelisted makes sending an unexpected null shape a 400.
      ...(draft.remarks ? { remarks: draft.remarks } : {}),
    };
  }

  private static toActor(dto: { id: string; fullName: string }): InspectionActor {
    return { id: dto.id, fullName: dto.fullName };
  }

  private static toPlant(dto: {
    id: string;
    code: string;
    name: string;
  }): InspectionPlant {
    return { id: dto.id, code: dto.code, name: dto.name };
  }
}
