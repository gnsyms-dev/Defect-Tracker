import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlantEntity } from '../entities/plant.entity';
import { PLANTS_REPOSITORY } from '../../type/plants-repository.port';
import type { PlantsRepositoryPort } from '../../type/plants-repository.port';
import { PlantsErrorMessage } from '../../type/plants.error.message';

@Injectable()
export class PlantsService {
  private readonly logger = new Logger(PlantsService.name);

  constructor(
    @Inject(PLANTS_REPOSITORY)
    private readonly plantsRepository: PlantsRepositoryPort,
  ) {}

  async listActive(): Promise<readonly PlantEntity[]> {
    const plants = await this.plantsRepository.findAllActive();
    // An empty list is not an error here, but it renders as an empty plant
    // filter -- so it is logged as a warning rather than left to look like a
    // frontend bug.
    if (plants.length === 0) {
      this.logger.warn('No active plants configured');
    } else {
      this.logger.debug(`Listed active plants count=${plants.length}`);
    }
    return plants;
  }

  async getById(id: string): Promise<PlantEntity> {
    const plant = await this.plantsRepository.findById(id);
    if (!plant) {
      this.logger.warn(`Plant not found id=${id}`);
      throw new NotFoundException(PlantsErrorMessage.NotFound);
    }
    this.logger.debug(`Resolved plant id=${id} code=${plant.code}`);
    return plant;
  }
}
