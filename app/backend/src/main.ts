import './config/telemetry/tracing.bootstrap';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { CorsConfigService } from '@config/cors/cors-config.service';
import { EnvironmentVariables } from '@config/environment/env.types';
import { WinstonLoggerService } from '@config/logger/winston-logger.service';
import { setupSwagger } from '@config/swagger/swagger.config';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

// Under `nest start --watch`, the CLI kills the previous process and only spawns the
// replacement once that process's exit is confirmed by the OS — but the port can still
// briefly appear bound to the new process on the first attempt. Retrying absorbs that gap
// instead of crashing the dev server on every hot-reload.
async function listenWithRetry(
  app: INestApplication,
  port: number,
  logger: WinstonLoggerService,
  attempts = 5,
  delayMs = 300,
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await app.listen(port);
      return;
    } catch (err) {
      const isAddrInUse =
        err instanceof Error && 'code' in err && err.code === 'EADDRINUSE';
      if (!isAddrInUse || attempt === attempts) {
        throw err;
      }
      logger.warn(
        `Port ${port} still in use, retrying (${attempt}/${attempts})...`,
        'Bootstrap',
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(WinstonLoggerService);
  const configService = app.get(ConfigService<EnvironmentVariables, true>);

  app.useLogger(logger);
  app.enableShutdownHooks();

  if (configService.get('HELMET_ENABLED', { infer: true })) {
    app.use(helmet());
  }

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const corsConfigService = app.get(CorsConfigService);
  if (corsConfigService.isCorsEnabled()) {
    app.enableCors(corsConfigService.getCorsConfig());
  }

  setupSwagger(app, configService);

  await listenWithRetry(
    app,
    configService.get('PORT', { infer: true }),
    logger,
  );

  logger.log(`Application is running on: ${await app.getUrl()}`, 'Bootstrap1');
}
bootstrap();
