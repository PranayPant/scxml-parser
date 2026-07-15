import { describe, it, expect } from 'vitest';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { findStateById } from './scxml-manipulation-utils';

const parse = (xml: string) => {
  const result = new SCXMLParser().parse(xml);
  if (!result.success || !result.data) {
    throw new Error(`Failed to parse fixture: ${result.errors?.[0]?.message}`);
  }
  return result.data;
};

describe('findStateById', () => {
  it('finds a plain root-level state (regression)', () => {
    const doc = parse(`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
      <state id="idle"/>
    </scxml>`);

    expect(findStateById(doc, 'idle')?.['@_id']).toBe('idle');
  });

  it('finds a region nested inside a <parallel> — this is the bug being fixed', () => {
    const doc = parse(`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
      <parallel id="running">
        <state id="region_1"/>
        <state id="region_2"/>
      </parallel>
    </scxml>`);

    expect(findStateById(doc, 'region_1')?.['@_id']).toBe('region_1');
    expect(findStateById(doc, 'region_2')?.['@_id']).toBe('region_2');
  });

  it('finds the <parallel> element itself by id', () => {
    const doc = parse(`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
      <parallel id="running">
        <state id="region_1"/>
      </parallel>
    </scxml>`);

    expect(findStateById(doc, 'running')?.['@_id']).toBe('running');
  });

  it('finds a state nested inside a nested parallel-within-a-parallel', () => {
    const doc = parse(`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outer">
      <parallel id="outer">
        <state id="region_1"/>
        <parallel id="inner">
          <state id="sub_x"/>
          <state id="sub_y"/>
        </parallel>
      </parallel>
    </scxml>`);

    expect(findStateById(doc, 'sub_x')?.['@_id']).toBe('sub_x');
    expect(findStateById(doc, 'sub_y')?.['@_id']).toBe('sub_y');
  });

  it('finds a state nested inside a region that is itself a compound state', () => {
    const doc = parse(`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
      <parallel id="running">
        <state id="motor_region" initial="motor_idle">
          <state id="motor_idle"/>
          <state id="motor_running"/>
        </state>
      </parallel>
    </scxml>`);

    expect(findStateById(doc, 'motor_idle')?.['@_id']).toBe('motor_idle');
  });

  it('returns null for an id that does not exist anywhere', () => {
    const doc = parse(`<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
      <parallel id="running">
        <state id="region_1"/>
      </parallel>
    </scxml>`);

    expect(findStateById(doc, 'nonexistent')).toBeNull();
  });
});
