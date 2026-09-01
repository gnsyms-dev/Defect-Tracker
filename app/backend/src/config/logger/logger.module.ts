import { Global, Module } from '@nestjs/common';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { WinstonLoggerService } from './winston-logger.service';

@Global()
@Module({
  imports: [TelemetryModule],
  providers: [WinstonLoggerService],
  exports: [WinstonLoggerService],
})
export class LoggerModule {}
