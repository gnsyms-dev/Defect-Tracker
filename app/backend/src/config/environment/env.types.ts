import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export const WinstonLogLevel = {
  Error: 'error',
  Warn: 'warn',
  Info: 'info',
  Http: 'http',
  Verbose: 'verbose',
  Debug: 'debug',
  Silly: 'silly',
} as const;
export type WinstonLogLevel =
  (typeof WinstonLogLevel)[keyof typeof WinstonLogLevel];

export enum OtelExporterType {
  None = 'none',
  Console = 'console',
  Otlp = 'otlp',
}

export class EnvironmentVariables {
  @IsOptional()
  @IsIn([Environment.Development, Environment.Production, Environment.Test])
  NODE_ENV: Environment = Environment.Development;

  @Transform(({ value }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  @Max(65535)
  PORT: number;

  /**
   * ==========================================================================
   * OBSERVABILITY CONFIGURATIONS
   * ==========================================================================
   */
  @IsOptional()
  @IsString()
  @Matches(
    new RegExp(
      `^(${Object.values(WinstonLogLevel).join('|')})(\\s*,\\s*(${Object.values(WinstonLogLevel).join('|')}))*$`,
    ),
    {
      message: `LOG_LEVEL must be a comma-separated list of: ${Object.values(WinstonLogLevel).join(', ')}`,
    },
  )
  LOG_LEVEL: string = WinstonLogLevel.Debug;

  @IsOptional()
  @IsString()
  LOG_DIR: string = 'logs';

  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : value === true || value === 'true',
  )
  @IsOptional()
  @IsBoolean()
  OTEL_ENABLED: boolean = true;

  @IsOptional()
  @IsString()
  OTEL_SERVICE_NAME: string = 'hakka-backend';

  @IsOptional()
  @IsIn([
    OtelExporterType.None,
    OtelExporterType.Console,
    OtelExporterType.Otlp,
  ])
  OTEL_EXPORTER_TYPE: OtelExporterType = OtelExporterType.None;

  @IsOptional()
  @IsString()
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;

  /**
   * ==========================================================================
   * CORS CONFIGURATIONS
   * ==========================================================================
   */
  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : value === true || value === 'true',
  )
  @IsOptional()
  @IsBoolean()
  CORS_ENABLED: boolean = true;

  @IsOptional()
  @IsString()
  CORS_ALLOWED_ORIGINS: string = '*';

  @IsOptional()
  @IsString()
  CORS_ALLOWED_METHODS: string = 'GET,HEAD,PUT,PATCH,POST,DELETE';

  @IsOptional()
  @IsString()
  CORS_ALLOWED_HEADERS: string = 'Content-Type,Authorization';

  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : value === true || value === 'true',
  )
  @IsOptional()
  @IsBoolean()
  CORS_CREDENTIALS: boolean = false;

  /**
   * ==========================================================================
   * SECURITY CONFIGURATIONS
   * ==========================================================================
   */
  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : value === true || value === 'true',
  )
  @IsOptional()
  @IsBoolean()
  HELMET_ENABLED: boolean = true;

  /**
   * ==========================================================================
   * LANGUAGE CONFIGURATIONS
   * ==========================================================================
   */
  @IsOptional()
  @IsString()
  DEFAULT_LANGUAGE: string = 'en';

  /**
   * ==========================================================================
   * DATABASE CONFIGURATIONS
   * ==========================================================================
   */
  @IsNotEmpty()
  @IsString()
  DB_HOST: string;

  @Transform(({ value }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  DB_PORT: number = 5432;

  @IsNotEmpty()
  @IsString()
  DB_USERNAME: string;

  @IsNotEmpty()
  @IsString()
  DB_PASSWORD: string;

  @IsNotEmpty()
  @IsString()
  DB_NAME: string;

  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : value === true || value === 'true',
  )
  @IsOptional()
  @IsBoolean()
  DB_SSL: boolean = false;

  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : value === true || value === 'true',
  )
  @IsOptional()
  @IsBoolean()
  DB_LOGGING: boolean = false;

  @Transform(({ value }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  DB_POOL_MAX: number = 10;

  @Transform(({ value }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsOptional()
  @IsInt()
  @Min(0)
  DB_POOL_MIN: number = 0;

  @Transform(({ value }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsOptional()
  @IsInt()
  @Min(0)
  DB_POOL_IDLE_MS: number = 10000;
}

export type EnvKeys = Extract<keyof EnvironmentVariables, string>;
