import { describe, it, expect } from 'vitest';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { SCXMLValidator } from './scxml-validator';

const parse = (xml: string) => {
  const result = new SCXMLParser().parse(xml);
  if (!result.success || !result.data) {
    throw new Error(`Failed to parse fixture: ${result.errors?.[0]?.message}`);
  }
  return result.data;
};

const validate = (xml: string) => new SCXMLValidator().validate(parse(xml).scxml, xml);

const CROSS_REGION_MESSAGE = /different regions of the same <parallel>/;

describe('parallel region connectivity validation (Phase 3)', () => {
  it('flags a transition that jumps from one region straight to a sibling region', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
      <parallel id="running">
        <state id="region_1">
          <transition event="jump" target="region_2"/>
        </state>
        <state id="region_2"/>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => CROSS_REGION_MESSAGE.test(e.message))).toBe(true);
  });

  it('flags a transition between deeply-nested states in different regions', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
      <parallel id="running">
        <state id="motor_region" initial="motor_idle">
          <state id="motor_idle">
            <transition event="jump" target="sensor_reading"/>
          </state>
          <state id="motor_running"/>
        </state>
        <state id="sensor_region" initial="sensor_idle">
          <state id="sensor_idle"/>
          <state id="sensor_reading"/>
        </state>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => CROSS_REGION_MESSAGE.test(e.message))).toBe(true);
  });

  it('allows a transition that stays within the same region', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
      <parallel id="running">
        <state id="motor_region" initial="motor_idle">
          <state id="motor_idle">
            <transition event="start" target="motor_running"/>
          </state>
          <state id="motor_running"/>
        </state>
        <state id="sensor_region" initial="sensor_idle">
          <state id="sensor_idle"/>
        </state>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => CROSS_REGION_MESSAGE.test(e.message))).toBe(false);
  });

  it('allows a transition on the parallel element itself leaving the whole parallel', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
      <parallel id="running">
        <state id="region_1"/>
        <state id="region_2"/>
        <transition event="done.state.running" target="shutdown"/>
      </parallel>
      <final id="shutdown"/>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => CROSS_REGION_MESSAGE.test(e.message))).toBe(false);
  });

  it('flags a jump between sibling regions of a nested parallel-within-a-parallel', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outer">
      <parallel id="outer">
        <state id="region_1"/>
        <parallel id="inner">
          <state id="sub_x">
            <transition event="jump" target="sub_y"/>
          </state>
          <state id="sub_y"/>
        </parallel>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => CROSS_REGION_MESSAGE.test(e.message))).toBe(true);
  });

  it('does not flag anything when there are no parallel states in the document', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
      <state id="idle">
        <transition event="go" target="running"/>
      </state>
      <state id="running"/>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => CROSS_REGION_MESSAGE.test(e.message))).toBe(false);
  });
});

describe('disconnected parallel machines validation (Phase 3)', () => {
  const DISCONNECTED_MESSAGE = /different <parallel> state machines/;

  it('flags a transition directly between two unrelated top-level parallel wrappers', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="parallel_1">
      <parallel id="parallel_1">
        <state id="region_1"/>
        <state id="region_2"/>
        <transition event="go" target="parallel_2"/>
      </parallel>
      <parallel id="parallel_2">
        <state id="region_3"/>
        <state id="region_4"/>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => DISCONNECTED_MESSAGE.test(e.message))).toBe(true);
  });

  it('flags a transition from a region of one parallel into a region of a different parallel', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="parallel_1">
      <parallel id="parallel_1">
        <state id="region_1">
          <transition event="go" target="region_3"/>
        </state>
        <state id="region_2"/>
      </parallel>
      <parallel id="parallel_2">
        <state id="region_3"/>
        <state id="region_4"/>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => DISCONNECTED_MESSAGE.test(e.message))).toBe(true);
  });

  it('allows a transition leaving a parallel entirely to a plain external state', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
      <parallel id="running">
        <state id="region_1"/>
        <state id="region_2"/>
        <transition event="done.state.running" target="shutdown"/>
      </parallel>
      <final id="shutdown"/>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => DISCONNECTED_MESSAGE.test(e.message))).toBe(false);
  });

  it('allows a nested parallel re-targeting its own enclosing (ancestor) parallel', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outer">
      <parallel id="outer">
        <state id="region_1"/>
        <parallel id="inner">
          <state id="sub_x">
            <transition event="reset" target="outer"/>
          </state>
          <state id="sub_y"/>
        </parallel>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => DISCONNECTED_MESSAGE.test(e.message))).toBe(false);
  });

  it('allows a plain state to transition into a parallel (normal entry)', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
      <state id="idle">
        <transition event="start" target="running"/>
      </state>
      <parallel id="running">
        <state id="region_1"/>
        <state id="region_2"/>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => DISCONNECTED_MESSAGE.test(e.message))).toBe(false);
  });
});

describe('parallel region initial-state validation (Phase 3)', () => {
  const INITIAL_MESSAGE = /must have either an 'initial' attribute/;

  it('flags a compound region with children but no initial attribute', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
      <parallel id="running">
        <state id="motor_region">
          <state id="motor_idle"/>
          <state id="motor_running"/>
        </state>
        <state id="sensor_region" initial="sensor_idle">
          <state id="sensor_idle"/>
        </state>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    const motorErrors = errors.filter(
      (e) => INITIAL_MESSAGE.test(e.message) && e.message.includes('motor_region')
    );
    expect(motorErrors.length).toBeGreaterThan(0);

    const sensorErrors = errors.filter(
      (e) => INITIAL_MESSAGE.test(e.message) && e.message.includes('sensor_region')
    );
    expect(sensorErrors.length).toBe(0);
  });

  it('does not require an initial attribute on a leaf region (no children)', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
      <parallel id="running">
        <state id="region_1"/>
        <state id="region_2"/>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => INITIAL_MESSAGE.test(e.message))).toBe(false);
  });

  it('flags a compound region nested inside a nested parallel', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outer">
      <parallel id="outer">
        <state id="region_1"/>
        <parallel id="inner">
          <state id="sub_region">
            <state id="sub_a"/>
            <state id="sub_b"/>
          </state>
          <state id="sub_leaf"/>
        </parallel>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    expect(
      errors.some((e) => INITIAL_MESSAGE.test(e.message) && e.message.includes('sub_region'))
    ).toBe(true);
  });

  it('does not require an initial attribute on the <parallel> element itself', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
      <parallel id="running">
        <state id="region_1" initial="region_1_a">
          <state id="region_1_a"/>
        </state>
        <state id="region_2" initial="region_2_a">
          <state id="region_2_a"/>
        </state>
      </parallel>
    </scxml>`;

    const errors = validate(xml);
    expect(errors.some((e) => INITIAL_MESSAGE.test(e.message) && e.message.includes('running'))).toBe(
      false
    );
  });
});
