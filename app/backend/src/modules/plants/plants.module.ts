import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { PlantsController } from './api/plants.controller';
import { PlantsService } from './domain/services/plants.service';
import { PlantModel } from './infrastructure/database/sql/models/plant.model';
import { PlantsRepository } from './infrastructure/database/sql/repositories/plants.repository';
import { PLANT_DIRECTORY } from './type/plant-directory.port';
import { PLANTS_REPOSITORY } from './type/plants-repository.port';

@Module({
  imports: [SequelizeModule.forFeature([PlantModel])],
  controllers: [PlantsController],
  providers: [
    PlantsService,
    { provide: PLANTS_REPOSITORY, useClass: PlantsRepository },
    // useExisting, not useClass: PlantsRepository implements both ports, so this
    // aliases the same singleton rather than constructing a second instance.
    { provide: PLANT_DIRECTORY, useExisting: PLANTS_REPOSITORY },
  ],
  // Only the narrow directory port leaves this module. PlantsService and the full
  // repository port stay internal.
  exports: [PLANT_DIRECTORY],
})
export class PlantsModule {}
