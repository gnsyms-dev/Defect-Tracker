import { PlantEntity } from '../../domain/entities/plant.entity';
import { PlantResponseDto } from '../dto/plants-response.dto';

export class PlantsApiMapper {
  static toResponseDto(entity: PlantEntity): PlantResponseDto {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      city: entity.city,
      state: entity.state,
    };
  }

  static toResponseDtoList(
    entities: readonly PlantEntity[],
  ): PlantResponseDto[] {
    return entities.map((entity) => PlantsApiMapper.toResponseDto(entity));
  }
}
