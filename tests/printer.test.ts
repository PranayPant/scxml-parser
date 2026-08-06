import { describe, expect, it } from 'vitest';
import { parseSCXML } from '../src/parser';
import type { SCXMLDocument } from '../src/types';
import { printAST } from '../src/utils/printer';

describe('printAST', () => {
  it('prints the root line with initial state', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a" />
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out.split('\n')[0]).toBe('SCXML Root [initial: "a"]');
  });

  it('prints the name attribute in the root line', () => {
    const xml = `
      <scxml name="machine" initial="a">
        <state id="a" />
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out.split('\n')[0]).toContain('name: "machine"');
  });

  it('prints "N/A" when no initial is present', () => {
    const xml = `<scxml name="m"><state id="a" /></scxml>`;
    const out = printAST(parseSCXML(xml).data!);
    expect(out.split('\n')[0]).toContain('initial: "N/A"');
  });

  it('renders datamodel entries when enabled', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel><data id="x" expr="(Order.total &gt; 100)" /></datamodel>
        <state id="a" />
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('<datamodel>');
    expect(out).toContain('id: "x"');
  });

  it('renders multiple datamodel entries using non-last prefixes', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel>
          <data id="x" expr="1" />
          <data id="y" expr="2" />
          <data id="z" expr="3" />
        </datamodel>
        <state id="a" />
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('│   ├── id: "x"');
    expect(out).toContain('│   ├── id: "y"');
    expect(out).toContain('│   └── id: "z"');
  });

  it('hides datamodel entries when disabled', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel><data id="x" expr="1" /></datamodel>
        <state id="a" />
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!, { includeDatamodel: false });
    expect(out).not.toContain('<datamodel>');
  });

  it('renders datamodel text fallback when no expr', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel><data id="x">raw text</data></datamodel>
        <state id="a" />
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('raw text');
  });

  it('renders "undefined" when data has neither expr nor text', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel><data id="x" /></datamodel>
        <state id="a" />
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('= undefined');
  });

  it('renders nested states and transitions', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" cond="x" target="b" />
          <state id="a1" />
        </state>
        <state id="b" />
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('State("a")');
    expect(out).toContain('State("a1")');
    expect(out).toContain('event: "GO"');
    expect(out).toContain('[cond: x]');
    expect(out).toContain('["b"]');
  });

  it('renders an internal transition without a target', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><transition event="E" /></state>
        <state id="b"><transition /></state>
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('(internal)');
    // The state "b" has a transition with no event, so it renders "always".
    expect(out).toContain('always');
  });

  it('renders parallel states', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <state id="a" />
          <state id="b" />
        </parallel>
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('Parallel("p")');
  });

  it('renders final states', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a" />
        <final id="done" />
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('Final("done")');
  });

  it('renders deep history with its type label', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><history id="h" type="deep" /></state>
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('History("h") [deep]');
  });

  it('renders shallow history without a type label', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><history id="h" /></state>
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('History("h")');
    expect(out).not.toContain('[deep]');
  });

  it('renders state type annotations', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a" type="compound"><state id="a1" /></state>
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('State("a") [compound]');
  });

  it('renders metadata summary when enabled', () => {
    const doc: SCXMLDocument = {
      scxml: {
        initial: 'a',
        states: [
          {
            id: 'a',
            transitions: [],
            states: [],
            parallels: [],
            finals: [],
            history: [],
            invoke: [],
          },
        ],
        parallels: [],
        finals: [],
        scripts: [],
        metadata: [{ tag: 'x' }, { tag: 'y' }],
      },
    };
    const out = printAST(doc);
    expect(out).toContain('<metadata> (2 blocks present)');
  });

  it('hides transitions when disabled', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><transition event="E" target="b" /></state>
        <state id="b" />
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!, { includeTransitions: false });
    expect(out).not.toContain('Transition(');
  });

  it('hides metadata summary when disabled', () => {
    const doc: SCXMLDocument = {
      scxml: {
        initial: 'a',
        states: [
          {
            id: 'a',
            transitions: [],
            states: [],
            parallels: [],
            finals: [],
            history: [],
            invoke: [],
          },
        ],
        parallels: [],
        finals: [],
        scripts: [],
        metadata: [{ tag: 'x' }],
      },
    };
    const out = printAST(doc, { includeMetadata: false });
    expect(out).not.toContain('<metadata>');
  });

  it('handles a document with only finals', () => {
    const xml = `
      <scxml version="1.0">
        <final id="f1" />
      </scxml>
    `;
    const out = printAST(parseSCXML(xml).data!);
    expect(out).toContain('Final("f1")');
  });

  it('handles empty root (no states, no metadata)', () => {
    const out = printAST({
      scxml: {
        initial: undefined,
        states: [],
        parallels: [],
        finals: [],
        scripts: [],
        metadata: [],
      },
    });
    expect(out.split('\n')[0]).toBe('SCXML Root [initial: "N/A"]');
  });
});
