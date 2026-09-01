export interface TraceContext {
  readonly traceId: string;
}

export interface ISpanHandle {
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(error: unknown): void;
}

export interface ITelemetryProvider {
  withSpan<T>(
    name: string,
    fn: (span: ISpanHandle) => T | Promise<T>,
  ): Promise<T>;
  getActiveTraceContext(): TraceContext | undefined;
  shutdown(): Promise<void>;
}
