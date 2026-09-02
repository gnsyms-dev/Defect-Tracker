import { join, resolve } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import {
  AcceptLanguageResolver,
  I18nJsonLoader,
  I18nModule,
} from 'nestjs-i18n';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from '@modules/auth/auth.module';
import { InspectionsModule } from '@modules/inspections/inspections.module';
import { PlantsModule } from '@modules/plants/plants.module';
import { GlobalExceptionFilter } from '@shared/filters/global-exception.filter';
import { LoggingInterceptor } from '@shared/interceptors/logging.interceptor';
import { CorsModule } from '@config/cors/cors.module';
import { DatabaseModule } from '@config/database/database.module';
import { EnvironmentVariables } from '@config/environment/env.types';
import { validateEnv } from '@config/environment/env.validation';
import { LoggerModule } from '@config/logger/logger.module';
import { TelemetryModule } from '@config/telemetry/telemetry.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // The repo keeps exactly one env file, at the root, two levels above this app.
      // Two runtimes read it, differently and both correctly:
      //   - on the host, npm scripts run with cwd=app/backend, so this resolves to the
      //     root .env and ConfigModule loads it;
      //   - in the container, cwd=/app and the app directory is all that was copied in,
      //     so this path does not exist. ConfigModule skips a missing env file silently
      //     and the config comes from the container environment, which compose fills from
      //     that same root .env via `env_file:`.
      // Either way process.env wins over the file, which is what lets docker-compose.yml
      // override DB_HOST for container-to-container networking.
      envFilePath: resolve(process.cwd(), '../../.env'),
      validate: validateEnv,
    }),
    TelemetryModule,
    LoggerModule,
    CorsModule,
    DatabaseModule,
    PlantsModule,
    AuthModule,
    InspectionsModule,
    I18nModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        fallbackLanguage: configService.get('DEFAULT_LANGUAGE', {
          infer: true,
        }),
        loader: I18nJsonLoader,
        loaderOptions: {
          path: join(__dirname, 'i18n/'),
          watch: true,
        },
      }),
      resolvers: [AcceptLanguageResolver],
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
