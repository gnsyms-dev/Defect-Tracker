import { Injectable } from '@nestjs/common';
import {
  ISpanHandle,
  ITelemetryProvider,
  TraceContext,
} from '../interfaces/telemetry-provider.interface';

@Injectable()
export class NoopTelemetryProvider implements ITelemetryProvider {
  async withSpan<T>(
    _name: string,
    fn: (span: ISpanHandle) => T | Promise<T>,
  ): Promise<T> {
    return fn({
      setAttribute: () => undefined,
      recordException: () => undefined,
    });
  }

  getActiveTraceContext(): TraceContext | undefined {
    return undefined;
  }

  async shutdown(): Promise<void> {
    return undefined;
  }
}
