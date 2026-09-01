import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { ConfigService } from '@nestjs/config';
import { Environment, EnvironmentVariables } from '../environment/env.types';
import { ITelemetryProvider } from '../telemetry/interfaces/telemetry-provider.interface';
import { LogLevel } from './log-level.enum';
import { LogUtils } from './logger.util';

export function createWinstonLogger(
  configService: ConfigService<EnvironmentVariables, true>,
  telemetry: ITelemetryProvider,
): winston.Logger {
  const isProduction =
    configService.get('NODE_ENV', { infer: true }) === Environment.Production;
  const logDir = configService.get('LOG_DIR', { infer: true });

  const traceCorrelationFormat =
    LogUtils.createTraceCorrelationFormat(telemetry);

  const consoleFormat = isProduction
    ? LogUtils.createJsonLogFormat(traceCorrelationFormat)
    : LogUtils.createPrettyConsoleFormat(traceCorrelationFormat);

  return winston.createLogger({
    level: LogLevel.Debug,
    transports: [
      new winston.transports.Console({ format: consoleFormat }),
      new winston.transports.DailyRotateFile({
        dirname: logDir,
        filename: 'application-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        format: LogUtils.createJsonLogFormat(traceCorrelationFormat),
      }),
    ],
  });
}
