import { PlantEntity } from '../../../../domain/entities/plant.entity';
import type { PlantSummary } from '../../../../type/plant-directory.port';
import { PlantModel } from '../models/plant.model';

export class PlantPersistenceMapper {
  static toDomain(model: PlantModel): PlantEntity {
    return new PlantEntity(
      model.id,
      model.code,
      model.name,
      model.city,
      model.state,
      model.isActive,
    );
  }

  static toSummary(model: PlantModel): PlantSummary {
    return { id: model.id, code: model.code, name: model.name };
  }
}
