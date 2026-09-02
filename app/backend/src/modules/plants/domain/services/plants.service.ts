import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PlantEntity } from '../entities/plant.entity';
import { PLANTS_REPOSITORY } from '../../type/plants-repository.port';
import type { PlantsRepositoryPort } from '../../type/plants-repository.port';
import { PlantsErrorMessage } from '../../type/plants.error.message';

@Injectable()
export class PlantsService {
  constructor(
    @Inject(PLANTS_REPOSITORY)
    private readonly plantsRepository: PlantsRepositoryPort,
  ) {}

  async listActive(): Promise<readonly PlantEntity[]> {
    return this.plantsRepository.findAllActive();
  }

  async getById(id: string): Promise<PlantEntity> {
    const plant = await this.plantsRepository.findById(id);
    if (!plant) {
      throw new NotFoundException(PlantsErrorMessage.NotFound);
    }
    return plant;
  }
}
