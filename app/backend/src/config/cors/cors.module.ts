import { Module } from '@nestjs/common';
import { CorsConfigService } from './cors-config.service';

@Module({
  providers: [CorsConfigService],
  exports: [CorsConfigService],
})
export class CorsModule {}
