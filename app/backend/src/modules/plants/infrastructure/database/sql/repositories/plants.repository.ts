import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PlantEntity } from '../../../../domain/entities/plant.entity';
import type { PlantsRepositoryPort } from '../../../../type/plants-repository.port';
import type {
  PlantDirectoryPort,
  PlantSummary,
} from '../../../../type/plant-directory.port';
import { PlantPersistenceMapper } from '../mapper/plant-persistence.mapper';
import { PlantModel } from '../models/plant.model';

// One class implements both ports. The module then binds PLANTS_REPOSITORY to this
// class and aliases PLANT_DIRECTORY to it with `useExisting`, so consumers get a
// narrow interface without a second instance or a forwarding service.
@Injectable()
export class PlantsRepository
  implements PlantsRepositoryPort, PlantDirectoryPort
{
  private readonly logger = new Logger(PlantsRepository.name);

  constructor(
    @InjectModel(PlantModel)
    private readonly plantModel: typeof PlantModel,
  ) {}

  async findAllActive(): Promise<readonly PlantEntity[]> {
    const startedAt = Date.now();
    const rows = await this.plantModel.findAll({
      where: { isActive: true },
      order: [
        ['state', 'ASC'],
        ['name', 'ASC'],
      ],
    });

    this.logger.debug(
      `findAllActive rows=${rows.length} +${Date.now() - startedAt}ms`,
    );

    return rows.map((row) => PlantPersistenceMapper.toDomain(row));
  }

  async findById(id: string): Promise<PlantEntity | null> {
    const row = await this.plantModel.findByPk(id);
    this.logger.debug(`findById id=${id} result=${row ? 'hit' : 'miss'}`);
    return row ? PlantPersistenceMapper.toDomain(row) : null;
  }

  async findSummariesByIds(
    ids: readonly string[],
  ): Promise<readonly PlantSummary[]> {
    // Guard the empty case: `IN ()` is invalid SQL, and Sequelize would otherwise
    // build a query that always matches nothing in a more expensive way.
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.plantModel.findAll({
      where: { id: { [Op.in]: [...ids] } },
      attributes: ['id', 'code', 'name'],
    });

    this.logger.debug(
      `findSummariesByIds requested=${ids.length} found=${rows.length}`,
    );

    return rows.map((row) => PlantPersistenceMapper.toSummary(row));
  }
}
