import { describe, expect, it } from 'vitest';
import { parseSCXML } from '../src/parser';
import { toMermaid } from '../src/utils/mermaid';

/** Helper: parse an SCXML string into its AST, asserting success. */
function parse(xml: string) {
  const result = parseSCXML(xml);
  expect(result.success).toBe(true);
  return result.data!;
}

describe('toMermaid', () => {
  it('emits a stateDiagram-v2 header with an initial arrow', () => {
    const xml = `<scxml version="1.0" initial="a"><state id="a" /></scxml>`;
    const out = toMermaid(parse(xml));
    expect(out.split('\n')[0]).toBe('stateDiagram-v2');
    expect(out).toContain('[*] --> a');
  });

  it('includes a title from the SCXML name by default', () => {
    const xml = `<scxml name="Flow" initial="a"><state id="a" /></scxml>`;
    const out = toMermaid(parse(xml));
    expect(out).toContain('title Flow');
  });

  it('omits the title when disabled or when the doc has no name', () => {
    const named = parse(`<scxml name="Flow" initial="a"><state id="a" /></scxml>`);
    expect(toMermaid(named, { includeTitle: false })).not.toContain('title');
    const unnamed = parse(`<scxml initial="a"><state id="a" /></scxml>`);
    expect(toMermaid(unnamed)).not.toContain('title');
  });

  it('honors the direction option', () => {
    const xml = `<scxml initial="a"><state id="a" /></scxml>`;
    expect(toMermaid(parse(xml))).toContain('direction LR');
    expect(toMermaid(parse(xml), { direction: 'TB' })).toContain('direction TB');
  });

  it('falls back to the first child when no initial attribute is set', () => {
    const xml = `<scxml><state id="first" /></scxml>`;
    const out = toMermaid(parse(xml));
    expect(out).toContain('[*] --> first');
  });

  it('renders leaf states, finals, and history pseudo-states', () => {
    const xml = `
      <scxml initial="a">
        <state id="a">
          <history id="h" />
          <state id="leaf" />
        </state>
        <final id="done" />
      </scxml>
    `;
    const out = toMermaid(parse(xml));
    expect(out).toContain('state "a" as a {');
    expect(out).toContain('state "leaf" as leaf');
    expect(out).toContain('state h <<history>>');
    expect(out).toContain('state done <<final>>');
  });

  it('renders a compound state with nested children and LR direction', () => {
    const xml = `
      <scxml initial="a">
        <state id="a">
          <state id="b" />
          <state id="c" />
        </state>
      </scxml>
    `;
    const out = toMermaid(parse(xml));
    expect(out).toContain('state "a" as a {');
    expect(out).toContain('    direction LR');
    expect(out).toMatch(/state "b" as b/);
    expect(out).toMatch(/state "c" as c/);
  });

  it('renders edges for transitions with event and condition', () => {
    const xml = `
      <scxml initial="a">
        <state id="a">
          <transition event="GO" cond="x > 1" target="b" />
        </state>
        <state id="b" />
      </scxml>
    `;
    const out = toMermaid(parse(xml));
    expect(out).toContain('a --> b : GO [x > 1]');
  });

  it('renders a multi-target transition and an internal self-loop', () => {
    const xml = `
      <scxml initial="a">
        <state id="a">
          <transition event="BRANCH" target="b c" />
          <transition event="STAY" />
        </state>
        <state id="b" />
        <state id="c" />
      </scxml>
    `;
    const out = toMermaid(parse(xml));
    expect(out).toContain('a --> b : BRANCH');
    expect(out).toContain('a --> c : BRANCH');
    expect(out).toContain('a --> a : STAY');
  });

  it('omits edge labels when includeEdgeLabels is false', () => {
    const xml = `
      <scxml initial="a">
        <state id="a">
          <transition event="GO" cond="x > 1" target="b" />
        </state>
        <state id="b" />
      </scxml>
    `;
    const out = toMermaid(parse(xml), { includeEdgeLabels: false });
    expect(out).toContain('a --> b');
    expect(out).not.toMatch(/a --> b :/);
    expect(out).not.toContain('GO');
    expect(out).not.toContain('x > 1');
  });

  it('renders a transition with neither event nor condition without a label', () => {
    const xml = `
      <scxml initial="a">
        <state id="a">
          <transition target="b" />
        </state>
        <state id="b" />
      </scxml>
    `;
    const out = toMermaid(parse(xml));
    expect(out).toContain('a --> b');
    expect(out).not.toMatch(/a --> b :/);
  });

  it('renders an explicit <initial> block default transition', () => {
    const xml = `
      <scxml initial="a">
        <state id="a">
          <initial>
            <transition target="b" />
          </initial>
          <state id="b" />
        </state>
      </scxml>
    `;
    const out = toMermaid(parse(xml));
    expect(out).toContain('a --> b');
  });

  it('sanitizes ids with invalid Mermaid characters', () => {
    const xml = `<scxml initial="1go"><state id="1go" /></scxml>`;
    const out = toMermaid(parse(xml));
    expect(out).toContain('[*] --> _1go');
    expect(out).toContain('state "1go" as _1go');
  });

  it('escapes quotes inside labels', () => {
    const xml = `<scxml name="A &quot;quoted&quot; name" initial="a"><state id="a" /></scxml>`;
    const out = toMermaid(parse(xml));
    expect(out).toContain('title A \\"quoted\\" name');
  });
});
