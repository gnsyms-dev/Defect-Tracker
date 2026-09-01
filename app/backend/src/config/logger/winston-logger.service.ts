import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import { EnvironmentVariables } from '../environment/env.types';
import type { ITelemetryProvider } from '../telemetry/interfaces/telemetry-provider.interface';
import { TELEMETRY_PROVIDER } from '../telemetry/telemetry.constants';
import { LogLevel } from './log-level.enum';
import { LogUtils } from './logger.util';
import { createWinstonLogger } from './winston-logger.factory';

@Injectable()
export class WinstonLoggerService implements LoggerService {
  private readonly logger: winston.Logger;
  private readonly allowedLevels: string[];

  constructor(
    configService: ConfigService<EnvironmentVariables, true>,
    @Inject(TELEMETRY_PROVIDER) telemetry: ITelemetryProvider,
  ) {
    this.logger = createWinstonLogger(configService, telemetry);
    this.allowedLevels = configService
      .get('LOG_LEVEL', { infer: true })
      .split(',')
      .map((level) => level.trim());
  }

  private extractContext(optionalParams: unknown[]): string | undefined {
    return optionalParams.length > 0
      ? String(optionalParams[optionalParams.length - 1])
      : undefined;
  }

  private extractErrorArgs(
    optionalParams: unknown[],
  ): [trace: string | undefined, context: string | undefined] {
    if (optionalParams.length >= 2) {
      return [
        String(optionalParams[0]),
        String(optionalParams[optionalParams.length - 1]),
      ];
    }
    if (optionalParams.length === 1) {
      return [String(optionalParams[0]), undefined];
    }
    return [undefined, undefined];
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write(
      LogLevel.Info,
      String(message),
      this.extractContext(optionalParams),
    );
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const [trace, context] = this.extractErrorArgs(optionalParams);
    const sanitizedTrace = trace
      ? LogUtils.sanitizeErrorTrace(trace)
      : undefined;
    this.write(
      LogLevel.Error,
      sanitizedTrace
        ? `${String(message)}\n${sanitizedTrace}`
        : String(message),
      context,
    );
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write(
      LogLevel.Warn,
      String(message),
      this.extractContext(optionalParams),
    );
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write(
      LogLevel.Debug,
      String(message),
      this.extractContext(optionalParams),
    );
  }

  private write(level: LogLevel, message: string, context?: string): void {
    if (!this.allowedLevels.includes(level)) {
      return;
    }
    this.logger.log(level, LogUtils.sanitizeLogData(message), { context });
  }
}
