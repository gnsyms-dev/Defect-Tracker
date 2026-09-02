import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '@modules/auth/auth.module';
import { PlantsModule } from '@modules/plants/plants.module';
import { InspectionsController } from './api/inspections.controller';
import { InspectionsService } from './domain/services/inspections.service';
import { InspectionModel } from './infrastructure/database/sql/models/inspection.model';
import { InspectionsRepository } from './infrastructure/database/sql/repositories/inspections.repository';
import { INSPECTIONS_REPOSITORY } from './type/inspections-repository.port';

@Module({
  imports: [
    // Only this module's own model. Notably NOT UserModel or PlantModel: display
    // names come through the exported directory ports instead, so this module's
    // persistence adapter never learns another module's table layout.
    SequelizeModule.forFeature([InspectionModel]),
    AuthModule,
    PlantsModule,
  ],
  controllers: [InspectionsController],
  providers: [
    InspectionsService,
    { provide: INSPECTIONS_REPOSITORY, useClass: InspectionsRepository },
  ],
})
export class InspectionsModule {}
