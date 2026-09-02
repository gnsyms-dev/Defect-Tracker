import { Injectable } from '@nestjs/common';
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
  constructor(
    @InjectModel(PlantModel)
    private readonly plantModel: typeof PlantModel,
  ) {}

  async findAllActive(): Promise<readonly PlantEntity[]> {
    const rows = await this.plantModel.findAll({
      where: { isActive: true },
      order: [
        ['state', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    return rows.map((row) => PlantPersistenceMapper.toDomain(row));
  }

  async findById(id: string): Promise<PlantEntity | null> {
    const row = await this.plantModel.findByPk(id);
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
    return rows.map((row) => PlantPersistenceMapper.toSummary(row));
  }
}
