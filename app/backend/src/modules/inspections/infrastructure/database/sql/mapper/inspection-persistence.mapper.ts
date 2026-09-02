import { InspectionEntity } from '../../../../domain/entities/inspection.entity';
import { InspectionModel } from '../models/inspection.model';

export class InspectionPersistenceMapper {
  static toDomain(model: InspectionModel): InspectionEntity {
    return new InspectionEntity(
      model.id,
      model.clientUuid,
      model.plantId,
      model.loggedByUserId,
      // Already a 'YYYY-MM-DD' string from the DATEONLY column -- deliberately not
      // wrapped in a Date anywhere along this path.
      model.inspectionDate,
      model.machineLineId,
      model.defectType,
      model.severity,
      model.status,
      model.remarks ?? null,
      model.resolutionNote ?? null,
      model.resolvedByUserId ?? null,
      model.resolvedAt ?? null,
      model.loggedAt,
      model.createdAt,
      model.updatedAt,
    );
  }
}
