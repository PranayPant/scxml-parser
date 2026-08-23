import { describe, expect, it } from 'vitest';
import { parseSCXML } from '../src/parser';
import { validateAST } from '../src/validator';

describe('validateAST', () => {
  it('returns zero diagnostics for a valid state machine', () => {
    const xml = `
      <scxml version="1.0" initial="Idle">
        <state id="Idle">
          <transition event="START" target="Active" />
        </state>
        <state id="Active" />
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    expect(validateAST(doc)).toHaveLength(0);
  });

  it('detects an invalid transition target', () => {
    const xml = `
      <scxml version="1.0" initial="Idle">
        <state id="Idle">
          <transition event="START" target="NonExistent" />
        </state>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    const diagnostics = validateAST(doc);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('ERR_INVALID_TRANSITION_TARGET');
    expect(diagnostics[0].message).toContain('NonExistent');
    expect(diagnostics[0].severity).toBe('error');
  });

  it('detects an invalid initial reference on the root', () => {
    const xml = `
      <scxml version="1.0" initial="Missing">
        <state id="Idle" />
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    const diagnostics = validateAST(doc);
    expect(diagnostics.some((d) => d.code === 'ERR_INITIAL_STATE_NOT_FOUND')).toBe(true);
  });

  it('detects an invalid initial reference on a compound state', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a" initial="gone">
          <state id="a1" />
        </state>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    const diagnostics = validateAST(doc);
    const match = diagnostics.find((d) => d.code === 'ERR_INITIAL_STATE_NOT_FOUND');
    expect(match).toBeDefined();
    expect(match?.message).toContain("in state 'a'");
  });

  it('detects invalid initial transition block targets', () => {
    // A state using an explicit <initial><transition target> block.
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <initial><transition target="nope" /></initial>
          <state id="a1" />
        </state>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    expect(doc.scxml.states[0].initialBlock).toBeDefined();
    const diagnostics = validateAST(doc);
    expect(diagnostics.some((d) => d.code === 'ERR_INITIAL_STATE_NOT_FOUND')).toBe(true);
  });

  it('detects duplicate state ids', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a" />
        <state id="a" />
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    const diagnostics = validateAST(doc);
    expect(diagnostics.some((d) => d.code === 'ERR_DUPLICATE_STATE_ID')).toBe(true);
  });

  it('detects an invalid transition type', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><transition type="bogus" target="b" /></state>
        <state id="b" />
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    const diagnostics = validateAST(doc);
    expect(diagnostics.some((d) => d.code === 'ERR_INVALID_TRANSITION_TYPE')).toBe(true);
  });

  it('accepts internal and external transition types', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><transition type="internal" /><transition type="external" target="b" /></state>
        <state id="b" />
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    expect(validateAST(doc)).toHaveLength(0);
  });

  it('flags invalid event names as warnings', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><transition event="bad event name!" target="a" /></state>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    const diagnostics = validateAST(doc);
    const match = diagnostics.find((d) => d.code === 'ERR_INVALID_EVENT_NAME');
    expect(match).toBeDefined();
    expect(match?.severity).toBe('warning');
  });

  it('accepts wildcard and valid multi event names', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="*" target="a" />
          <transition event="done.foo error.*" target="a" />
        </state>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    expect(validateAST(doc)).toHaveLength(0);
  });

  it('detects duplicate datamodel variable ids across scopes', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel><data id="x" expr="1" /></datamodel>
        <state id="a"><datamodel><data id="x" expr="2" /></datamodel></state>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    const diagnostics = validateAST(doc);
    expect(diagnostics.some((d) => d.code === 'ERR_DUPLICATE_DATA_ID')).toBe(true);
  });

  it('does not flag unique datamodel ids across scopes', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel><data id="x" expr="1" /></datamodel>
        <state id="a"><datamodel><data id="y" expr="2" /></datamodel></state>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    expect(validateAST(doc)).toHaveLength(0);
  });

  it('validates transition targets inside state and parallel nodes', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <state id="a"><transition target="missing" /></state>
        </parallel>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    const diagnostics = validateAST(doc);
    expect(diagnostics.some((d) => d.code === 'ERR_INVALID_TRANSITION_TARGET')).toBe(true);
  });

  it('handles empty documents without throwing', () => {
    const doc = parseSCXML('<scxml/>').data!;
    expect(Array.isArray(validateAST(doc))).toBe(true);
  });

  it('handles transitions with no target gracefully', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><transition event="E" /></state>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    expect(validateAST(doc)).toHaveLength(0);
  });

  it('warns on a compound state with children but no explicit initial', () => {
    const xml = `
      <scxml version="1.0" initial="running">
        <state id="running">
          <state id="processing"><transition event="done" target="finished" /></state>
        </state>
        <final id="finished" />
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    const diagnostics = validateAST(doc);
    const match = diagnostics.find((d) => d.code === 'WARN_COMPOUND_STATE_NO_INITIAL');
    expect(match).toBeDefined();
    expect(match?.nodeId).toBe('running');
    expect(match?.severity).toBe('warning');
    expect(match?.message).toContain('first child');
  });

  it('does not warn when a compound state declares an explicit initial', () => {
    const xml = `
      <scxml version="1.0" initial="running">
        <state id="running" initial="processing">
          <state id="processing" />
        </state>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    expect(validateAST(doc)).toHaveLength(0);
  });

  it('does not warn when a compound state uses an <initial> block', () => {
    const xml = `
      <scxml version="1.0" initial="running">
        <state id="running">
          <initial><transition target="processing" /></initial>
          <state id="processing" />
        </state>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    expect(validateAST(doc)).toHaveLength(0);
  });

  it('does not warn on atomic states or parallel regions', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <state id="atomic" />
        <parallel id="p">
          <state id="a" />
          <state id="b" />
        </parallel>
      </scxml>
    `;
    const doc = parseSCXML(xml).data!;
    const diagnostics = validateAST(doc);
    expect(diagnostics.some((d) => d.code === 'WARN_COMPOUND_STATE_NO_INITIAL')).toBe(false);
  });
});
