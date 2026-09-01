import { trace } from '@opentelemetry/api';
import type { TraceContext } from './interfaces/telemetry-provider.interface';

export function readActiveTraceContext(): TraceContext | undefined {
  const span = trace.getActiveSpan();
  if (!span) {
    return undefined;
  }
  const { traceId } = span.spanContext();
  return { traceId };
}
