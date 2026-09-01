import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { EnvironmentVariables } from '../../environment/env.types';
import {
  ISpanHandle,
  ITelemetryProvider,
  TraceContext,
} from '../interfaces/telemetry-provider.interface';
import { readActiveTraceContext } from '../trace-context.util';
import { nodeSdk } from '../tracing.bootstrap';

@Injectable()
export class OpenTelemetryProvider
  implements ITelemetryProvider, OnApplicationShutdown
{
  private readonly tracer: ReturnType<typeof trace.getTracer>;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.tracer = trace.getTracer(
      this.configService.get('OTEL_SERVICE_NAME', { infer: true }),
    );
  }

  async withSpan<T>(
    name: string,
    fn: (span: ISpanHandle) => T | Promise<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span) => {
      const handle: ISpanHandle = {
        setAttribute: (key, value) => span.setAttribute(key, value),
        recordException: (error) => {
          span.recordException(error instanceof Error ? error : String(error));
          span.setStatus({ code: SpanStatusCode.ERROR });
        },
      };
      try {
        return await fn(handle);
      } finally {
        span.end();
      }
    });
  }

  getActiveTraceContext(): TraceContext | undefined {
    return readActiveTraceContext();
  }

  async shutdown(): Promise<void> {
    await nodeSdk.shutdown();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.shutdown();
  }
}
