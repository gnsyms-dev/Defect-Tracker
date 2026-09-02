import type { Plant } from '../../application/domain/entities/Plant';
import type { PlantDto } from './PlantDto';

export class PlantMapper {
  static toDomain(dto: PlantDto): Plant {
    return {
      id: dto.id,
      code: dto.code,
      name: dto.name,
      city: dto.city,
      state: dto.state,
    };
  }

  static toDomainList(dtos: readonly PlantDto[]): readonly Plant[] {
    return dtos.map((dto) => PlantMapper.toDomain(dto));
  }
}
