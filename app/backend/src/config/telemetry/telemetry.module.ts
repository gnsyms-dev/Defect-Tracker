import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../environment/env.types';
import { NoopTelemetryProvider } from './adapters/noop-telemetry.provider';
import { OpenTelemetryProvider } from './adapters/open-telemetry.provider';
import { TELEMETRY_PROVIDER } from './telemetry.constants';

@Global()
@Module({
  providers: [
    OpenTelemetryProvider,
    NoopTelemetryProvider,
    {
      provide: TELEMETRY_PROVIDER,
      useFactory: (
        config: ConfigService<EnvironmentVariables, true>,
        otel: OpenTelemetryProvider,
        noop: NoopTelemetryProvider,
      ) => (config.get('OTEL_ENABLED', { infer: true }) ? otel : noop),
      inject: [ConfigService, OpenTelemetryProvider, NoopTelemetryProvider],
    },
  ],
  exports: [TELEMETRY_PROVIDER],
})
export class TelemetryModule {}
