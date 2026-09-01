import { NodeSDK } from '@opentelemetry/sdk-node';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import {
  ConsoleSpanExporter,
  ReadableSpan,
  SpanExporter,
} from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

/**
 * Lets spans complete (so trace_id keeps flowing into logs) without
 * printing raw span JSON anywhere. Swap OTEL_EXPORTER_TYPE to 'otlp' once a
 * real tracing backend is available.
 */
class NoopSpanExporter implements SpanExporter {
  export(
    _spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const isTracingEnabled = process.env.OTEL_ENABLED !== 'false';
const exporterType = process.env.OTEL_EXPORTER_TYPE ?? 'none';
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'hakka-backend';

const traceExporter =
  exporterType === 'otlp'
    ? new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT })
    : exporterType === 'console'
      ? new ConsoleSpanExporter()
      : new NoopSpanExporter();

export const nodeSdk = new NodeSDK({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
  traceExporter,
  instrumentations: [new HttpInstrumentation(), new NestInstrumentation()],
});

if (isTracingEnabled) {
  nodeSdk.start();
}
