import * as winston from 'winston';
import type { ITelemetryProvider } from '../telemetry/interfaces/telemetry-provider.interface';

export class LogUtils {
  static createTraceCorrelationFormat(
    telemetry: ITelemetryProvider,
  ): winston.Logform.Format {
    return winston.format((info) => {
      const traceContext = telemetry.getActiveTraceContext();
      if (traceContext) {
        info.trace_id = traceContext.traceId;
      }
      return info;
    })();
  }

  static createJsonLogFormat(
    traceCorrelationFormat: winston.Logform.Format,
  ): winston.Logform.Format {
    return winston.format.combine(
      traceCorrelationFormat,
      winston.format.timestamp(),
      winston.format.json(),
    );
  }

  static createPrettyConsoleFormat(
    traceCorrelationFormat: winston.Logform.Format,
  ): winston.Logform.Format {
    return winston.format.combine(
      traceCorrelationFormat,
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf(
        ({ timestamp, level, message, context, trace_id }) =>
          [
            `${String(timestamp)} [${level}]`,
            context ? `[${String(context)}]` : undefined,
            String(message),
            trace_id ? `(trace_id=${String(trace_id)})` : undefined,
          ]
            .filter(Boolean)
            .join(' '),
      ),
    );
  }

  /**
   * @description Masks email addresses in the log message to prevent sensitive information from being logged. It shows the first 2 and last 2 characters of the username, while masking the rest with '*'.
   * @param { string } message
   * @returns { string }
   */
  static sanitizeLogData(message: string): string {
    return message.replace(
      /\b([A-Za-z0-9._%+-]{2})([A-Za-z0-9._%+-]*)([A-Za-z0-9._%+-]{2})@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g,
      (
        _: string,
        first2: string,
        middle: string,
        last2: string,
        domain: string,
      ) => {
        const masked = middle.replace(/./g, '*');
        return `${first2}${masked}${last2}@${domain}`;
      },
    );
  }

  /**
   * @description Sanitizes error traces by removing sensitive information such as file paths, line numbers, and other identifiable data. This helps in preventing sensitive information from being logged.
   * @param { string } trace
   * @returns { string }
   */
  static sanitizeErrorTrace(trace: string): string {
    return (
      trace
        // Remove anything in parentheses
        .replace(/\([^()]*\)/g, '(REDACTED)')
        // Remove UNIX paths (/x/y/z)
        .replace(/\/[^\s)]+/g, '[REDACTED]')
        // Remove Windows paths (C:\x\y\z)
        .replace(/[A-Za-z]:\\[^\s)]+/g, '[REDACTED]')
        // Remove filenames with extensions
        .replace(/\b[^/\\\s]+\.[a-zA-Z0-9]+\b/g, '[REDACTED]')
        // Remove line/column numbers :22 or :22:10
        .replace(/:\d+(?::\d+)?/g, '[REDACTED]')
    );
  }
}
