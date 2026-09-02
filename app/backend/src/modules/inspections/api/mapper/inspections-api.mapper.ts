import type { PlantSummary } from '@modules/plants/type/plant-directory.port';
import type { UserSummary } from '@modules/auth/type/user-directory.port';
import type { InspectionListItem } from '../../type/inspection-list-item.interface';
import type { InspectionSummary } from '../../type/inspection-summary.interface';
import {
  InspectionActorDto,
  InspectionPlantDto,
  InspectionResponseDto,
  InspectionSummaryResponseDto,
} from '../dto/inspections-response.dto';

export class InspectionsApiMapper {
  static toResponseDto(item: InspectionListItem): InspectionResponseDto {
    const { inspection } = item;

    return {
      id: inspection.id,
      clientUuid: inspection.clientUuid,
      inspectionDate: inspection.inspectionDate,
      machineLineId: inspection.machineLineId,
      defectType: inspection.defectType,
      severity: inspection.severity,
      status: inspection.status,
      remarks: inspection.remarks,
      resolutionNote: inspection.resolutionNote,
      resolvedBy: InspectionsApiMapper.toActorDto(item.resolvedBy),
      resolvedAt: inspection.resolvedAt?.toISOString() ?? null,
      loggedBy: InspectionsApiMapper.toActorDto(item.loggedBy),
      plant: InspectionsApiMapper.toPlantDto(item.plant),
      loggedAt: inspection.loggedAt.toISOString(),
      createdAt: inspection.createdAt.toISOString(),
      // Computed here rather than stored: it is derivable from two columns we
      // already have, and putting it in the response saves every client
      // reimplementing the subtraction.
      syncLagSeconds: Math.max(
        0,
        Math.round(
          (inspection.createdAt.getTime() - inspection.loggedAt.getTime()) /
            1000,
        ),
      ),
    };
  }

  static toResponseDtoList(
    items: readonly InspectionListItem[],
  ): InspectionResponseDto[] {
    return items.map((item) => InspectionsApiMapper.toResponseDto(item));
  }

  static toSummaryResponseDto(
    summary: InspectionSummary,
  ): InspectionSummaryResponseDto {
    return {
      totals: { ...summary.totals },
      bySeverity: summary.bySeverity.map((entry) => ({
        severity: entry.severity,
        open: entry.open,
        resolved: entry.resolved,
        total: entry.total,
      })),
      byPlant: summary.byPlant.map((entry) => ({
        plantId: entry.plantId,
        plant: InspectionsApiMapper.toPlantDto(entry.plant),
        open: entry.open,
        resolved: entry.resolved,
        total: entry.total,
      })),
    };
  }

  private static toActorDto(
    user: UserSummary | null,
  ): InspectionActorDto | null {
    // Only id and name cross the boundary -- the directory port never exposes more.
    return user ? { id: user.id, fullName: user.fullName } : null;
  }

  private static toPlantDto(
    plant: PlantSummary | null,
  ): InspectionPlantDto | null {
    return plant ? { id: plant.id, code: plant.code, name: plant.name } : null;
  }
}
