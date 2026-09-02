import { PlantEntity } from '../domain/entities/plant.entity';

export const PLANTS_REPOSITORY = Symbol('PLANTS_REPOSITORY');

export interface PlantsRepositoryPort {
  findAllActive(): Promise<readonly PlantEntity[]>;
  findById(id: string): Promise<PlantEntity | null>;
}
