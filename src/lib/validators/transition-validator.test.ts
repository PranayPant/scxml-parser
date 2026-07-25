import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { validateTransitionSemantics } from './transition-validator';

describe('validateTransitionSemantics event name validation', () => {
  it('reports no warnings for a comma-separated event list of valid identifiers', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_event': 'event1, event2', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors).toEqual([]);
  });

  it('still validates a legacy space-separated event list (backward compatibility)', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_event': 'event1 event2', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors).toEqual([]);
  });

  it('reports exactly one warning for a single invalid token inside a comma-separated list', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_event': 'event1, 1bad', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors.length).toBe(1);
    expect(errors[0].severity).toBe('warning');
    expect(errors[0].message).toContain('1bad');
  });

  it('accepts wildcard tokens inside a comma-separated list', () => {
    const scxml: SCXMLElement = {
      state: [{ '@_id': 'A', transition: { '@_event': '*, foo.*', '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSemantics(scxml, new Set(['A']), errors);
    expect(errors).toEqual([]);
  });
});
