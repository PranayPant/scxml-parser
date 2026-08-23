import { describe, expect, it } from 'vitest';
import { parserTracer } from '../src/index';

// ---------------------------------------------------------------------------
// Tests for the OTel tracer helper (src/tracing.ts).
//
// `parserTracer` is a module-level singleton built on `@opentelemetry/api`'s
// no-op tracer; these tests exercise every branch so the file stays at 100%
// coverage (the `vitest.config.ts` global thresholds).
// ---------------------------------------------------------------------------

describe('parserTracer', () => {
  afterEach(() => {
    // The tracer is a singleton; reset the detail flag so withDetailSpan
    // tests don't leak into subsequent tests.
    parserTracer.setDetail(false);
  });

  describe('withSpan', () => {
    it('runs the callback and returns its result', () => {
      const result = parserTracer.withSpan('test.span', { foo: 'bar' }, () => 42);
      expect(result).toBe(42);
    });

    it('rethrows a callback error after recording it on the span', () => {
      const boom = new Error('boom');
      expect(() =>
        parserTracer.withSpan('test.span', undefined, () => {
          throw boom;
        }),
      ).toThrow('boom');
    });
  });

  describe('withDetailSpan', () => {
    it('runs fn directly with no span when detail is disabled', () => {
      parserTracer.setDetail(false);
      const result = parserTracer.withDetailSpan('test.detail', undefined, () => 'plain');
      expect(result).toBe('plain');
    });

    it('delegates to withSpan when detail is enabled', () => {
      parserTracer.setDetail(true);
      const result = parserTracer.withDetailSpan('test.detail', undefined, () => 'spanned');
      expect(result).toBe('spanned');
    });

    it('propagates a callback error when detail is enabled', () => {
      parserTracer.setDetail(true);
      expect(() =>
        parserTracer.withDetailSpan('test.detail', undefined, () => {
          throw new Error('detail boom');
        }),
      ).toThrow('detail boom');
    });
  });

  describe('setDetail', () => {
    it('toggles the detail flag', () => {
      parserTracer.setDetail(true);
      // Enabling detail routes withDetailSpan through withSpan (spanned path).
      expect(parserTracer.withDetailSpan('test.toggle', undefined, () => 'on')).toBe('on');

      parserTracer.setDetail(false);
      // Disabling detail routes withDetailSpan straight to fn (plain path).
      expect(parserTracer.withDetailSpan('test.toggle', undefined, () => 'off')).toBe('off');
    });
  });
});
