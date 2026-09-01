import { Module } from '@nestjs/common';
import { SqlModule } from './sql/sql.module';

@Module({
  imports: [SqlModule],
  exports: [SqlModule],
})
export class DatabaseModule {}
