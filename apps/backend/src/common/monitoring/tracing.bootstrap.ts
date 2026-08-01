import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

/**
 * Distributed tracing bootstrap (ADR-0027). Must be required before any other
 * module (see main.ts) so auto-instrumentation can patch Node's http/pg/etc.
 * modules before they're first required elsewhere.
 *
 * Tracing is only enabled when OTEL_EXPORTER_OTLP_ENDPOINT is configured —
 * there is no tracing backend in every environment (e.g. this sandboxed Phase
 * 2 build has none, see docs/21-phase2-foundation-audit.md), and silently
 * trying to export to a non-existent collector would just be background
 * connection-refused noise. Once real business logic exists to trace
 * meaningfully (Phase 3+), an environment wires OTEL_EXPORTER_OTLP_ENDPOINT to
 * a real collector and this same bootstrap starts exporting — no code change.
 */
export function bootstrapTracing(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return;
  }

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'taxitawsila-backend',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
