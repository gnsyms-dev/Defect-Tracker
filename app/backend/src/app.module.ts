import { join } from 'path';
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
