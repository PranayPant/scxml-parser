import { describe, expect, it } from 'vitest';
import { parseSCXML } from '../src/parser';

describe('parseSCXML', () => {
  it('parses a valid minimal SCXML document', () => {
    const xml = `
      <scxml version="1.0" initial="Idle">
        <state id="Idle">
          <transition event="START" target="Active" />
        </state>
        <state id="Active" />
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    const doc = result.data!;
    expect(doc.scxml.initial).toBe('Idle');
    expect(doc.scxml.states).toHaveLength(2);
    expect(doc.scxml.states[0].id).toBe('Idle');
    expect(doc.scxml.states[0].transitions).toHaveLength(1);
  });

  it('treats an empty string as an error', () => {
    const result = parseSCXML('');
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('ERR_XML_SYNTAX');
    expect(result.data).toBeUndefined();
  });

  it('treats whitespace-only input as an error', () => {
    const result = parseSCXML('   \n\t  ');
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('reports malformed XML as an error', () => {
    const result = parseSCXML('<scxml><state id="a"></scxml>');
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('ERR_XML_SYNTAX');
  });

  it('rejects a document whose root is not <scxml>', () => {
    const result = parseSCXML('<root><foo /></root>');
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('ERR_ROOT_NOT_SCXML');
  });

  it('emits a warning for an empty state machine', () => {
    const xml = `<scxml/>`;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    expect(result.errors.some((e) => e.code === 'WARN_EMPTY_STATE_MACHINE')).toBe(true);
  });

  it('does not warn when a name attribute is present', () => {
    const xml = `<scxml name="machine"/>`;
    const result = parseSCXML(xml);
    expect(result.errors.some((e) => e.code === 'WARN_EMPTY_STATE_MACHINE')).toBe(false);
  });

  it('parses nested compound states and parallel states', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <state id="a"><state id="a1" /></state>
          <state id="b" />
        </parallel>
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    const doc = result.data!;
    expect(doc.scxml.parallels).toHaveLength(1);
    expect(doc.scxml.parallels[0].states).toHaveLength(2);
  });

  it('parses history pseudo-states', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><history id="h" type="deep" /></state>
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    expect(result.data?.scxml.states[0].history[0].id).toBe('h');
    expect(result.data?.scxml.states[0].history[0].type).toBe('deep');
  });

  it('parses final states with donedata', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a" />
        <final id="done">
          <donedata><content expr="result" /></donedata>
        </final>
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    const final = result.data?.scxml.finals[0];
    expect(final.id).toBe('done');
    expect(final.donedata?.content?.expr).toBe('result');
  });

  it('parses datamodel with data elements', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel>
          <data id="x" expr="1" />
          <data id="y">hello</data>
        </datamodel>
        <state id="a" />
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    const dm = result.data!.scxml.datamodelChildren!;
    expect(dm).toHaveLength(2);
    expect(dm[0].id).toBe('x');
    expect(dm[0].expr).toBe('1');
    expect(dm[1].text).toBe('hello');
  });

  it('parses executable content: onentry, raise, if, log, assign, send, cancel, foreach, script', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <onentry>
            <log label="enter" expr="'hi'" />
            <raise event="E" />
            <if cond="x > 1">
              <assign location="x" expr="x + 1" />
              <elseif cond="x === 1"><log label="one" /></elseif>
              <else><log label="other" /></else>
            </if>
            <foreach array="items" item="i" index="idx"><log label="i" expr="i" /></foreach>
            <send event="GO" target="#scxml" delay="1s" />
            <cancel sendid="s1" />
            <script>var z = 1;</script>
          </onentry>
        </state>
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    const onentry = result.data!.scxml.states[0].onentry!;
    expect(onentry).toHaveLength(7);
    const ifBlock = onentry.find((e) => e.kind === 'if')!;
    if (ifBlock.kind === 'if') {
      // if contains assign, elseif, and else
      expect(ifBlock.executable).toHaveLength(3);
      expect(ifBlock.executable[1].kind).toBe('elseif');
      expect(ifBlock.executable[2].kind).toBe('else');
    }
  });

  it('parses invoke with params and finalize', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <invoke id="svc" type="node" src="srv.js" autoforward="true">
            <param name="x" expr="1" />
            <finalize><log label="done" /></finalize>
          </invoke>
        </state>
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    const invoke = result.data?.scxml.states[0].invoke[0];
    expect(invoke.id).toBe('svc');
    expect(invoke.autoforward).toBe(true);
    expect(invoke.param).toHaveLength(1);
    expect(invoke.finalize).toHaveLength(1);
  });

  it('preserves unknown namespace/extension blocks as metadata', () => {
    const xml = `
      <scxml version="1.0" initial="a" xmlns:viz="http://visual-scxml-editor/metadata">
        <viz:note viz:id="n1" viz:xywh="0,0,100,100" />
        <state id="a" />
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    const meta = result.data!.scxml.metadata!;
    expect(meta.length).toBeGreaterThan(0);
    expect(meta[0].tag).toContain('viz');
  });

  it('parses single (non-array) children correctly', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel><data id="single" expr="1" /></datamodel>
        <state id="a"><transition event="X" target="a" /></state>
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    const doc = result.data!;
    expect(doc.scxml.datamodelChildren).toHaveLength(1);
    expect(doc.scxml.states[0].transitions).toHaveLength(1);
    expect(doc.scxml.states[0].transitions[0].event).toBe('X');
  });

  it('sets a default history type to shallow when not specified', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><history id="h" /></state>
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    expect(result.data?.scxml.states[0].history[0].type).toBe('shallow');
  });

  it('normalizes number-like text and attributes to strings', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><onentry><log expr="42" /></onentry></state>
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    const log = result.data?.scxml.states[0].onentry?.[0];
    expect(log.kind).toBe('log');
  });
});
