/**
 * Minimal OpenTelemetry tracer helper for scxml-parser.
 *
 * The parser is a published, headless library that depends only on
 * `@opentelemetry/api` (the no-op API). When a host application (e.g.
 * `scxml-ui-editor`) has registered an SDK, these spans join the host's trace;
 * otherwise every call is a no-op with negligible overhead.
 *
 * Detail gating: `setDetail(true)` enables fine-grained (DEBUG-style) spans
 * so hosts can mirror the server's INFO/DEBUG log-level split via their own
 * log-level env vars.
 */

import { type Attributes, SpanKind, type Tracer, trace } from '@opentelemetry/api';

const SERVICE_SCOPE = 'scxml-parser';

/** Wrapper around the (possibly no-op) OTel tracer for this library. */
class ParserTracer {
  private tracer: Tracer = trace.getTracer(SERVICE_SCOPE, '0.3.0');
  private detail = false;

  /** Enable/disable fine-grained (DEBUG-style) spans from the host. */
  setDetail(enabled: boolean): void {
    this.detail = enabled;
  }

  /**
   * Run `fn` inside a coarse span named `name`, adding `attributes` when a
   * real SDK is present. Returns `fn`'s result.
   */
  withSpan<T>(name: string, attributes: Attributes | undefined, fn: () => T): T {
    return this.tracer.startActiveSpan(name, { kind: SpanKind.INTERNAL, attributes }, (span) => {
      try {
        return fn();
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: 2 });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Run `fn` inside a fine-grained (DEBUG-style) span, or run it with no span
   * when detail is disabled.
   */
  withDetailSpan<T>(name: string, attributes: Attributes | undefined, fn: () => T): T {
    if (!this.detail) return fn();
    return this.withSpan(name, attributes, fn);
  }
}

export const parserTracer = new ParserTracer();
