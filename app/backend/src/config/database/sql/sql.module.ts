import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { SqlConfigService } from './sql-config.service';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      useClass: SqlConfigService,
    }),
  ],
  providers: [SqlConfigService],
  exports: [SequelizeModule],
})
export class SqlModule {}
