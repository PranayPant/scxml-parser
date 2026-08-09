import { describe, expect, it } from 'vitest';
import type { SCXMLDocument, ValidationDiagnostic } from '../src/index';
import {
  parseSCXML,
  printAST,
  SCXMLEngine,
  serializeSCXML,
  toMermaid,
  validateAST,
  walkStates,
  walkTransitions,
} from '../src/index';

describe('SCXMLEngine facade', () => {
  const validXml = `
    <scxml version="1.0" initial="Draft">
      <datamodel>
        <data id="rule_is_eligible" expr="(Order.total > 100)" />
        <data id="user_role" expr="'admin'" />
      </datamodel>
      <state id="Draft">
        <transition event="SUBMIT" cond="rule_is_eligible" target="Processing" />
      </state>
      <state id="Processing" />
    </scxml>
  `;

  it('parses via SCXMLEngine.parse', () => {
    const result = SCXMLEngine.parse(validXml);
    expect(result.success).toBe(true);
    expect(result.data?.scxml.initial).toBe('Draft');
  });

  it('validates via SCXMLEngine.validate', () => {
    const ast = SCXMLEngine.parse(validXml).data!;
    const errors: ValidationDiagnostic[] = SCXMLEngine.validate(ast);
    expect(errors).toHaveLength(0);
  });

  it('serializes via SCXMLEngine.serialize', () => {
    const ast = SCXMLEngine.parse(validXml).data!;
    const out = SCXMLEngine.serialize(ast, { pretty: true });
    expect(out).toContain('<scxml');
    expect(out).toContain('initial="Draft"');
  });

  it('prints via SCXMLEngine.print', () => {
    const ast = SCXMLEngine.parse(validXml).data!;
    const out = SCXMLEngine.print(ast);
    expect(out.split('\n')[0]).toContain('SCXML Root');
  });

  it('supports the full pipeline: parse -> mutate -> validate -> serialize', () => {
    const ast = SCXMLEngine.parse(validXml).data!;
    // Mutate the AST by appending a datamodel rule.
    ast.scxml.datamodelChildren = ast.scxml.datamodelChildren || [];
    ast.scxml.datamodelChildren.push({
      id: 'additional_rule',
      expr: 'Order.count > 0',
    });

    const errors = SCXMLEngine.validate(ast);
    expect(errors).toHaveLength(0);

    const finalXml = SCXMLEngine.serialize(ast, { pretty: true });
    expect(finalXml).toContain('additional_rule');
  });

  it('exports individual functions from the package entry', () => {
    expect(typeof parseSCXML).toBe('function');
    expect(typeof validateAST).toBe('function');
    expect(typeof serializeSCXML).toBe('function');
    expect(typeof printAST).toBe('function');
    expect(typeof toMermaid).toBe('function');
    expect(typeof walkStates).toBe('function');
    expect(typeof walkTransitions).toBe('function');
  });

  it('walks every state-like node via the exported walkStates', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><state id="a1" /></state>
        <parallel id="p"><state id="p1" /></parallel>
        <final id="f" />
      </scxml>
    `;
    const ast = SCXMLEngine.parse(xml).data!;
    const ids: string[] = [];
    walkStates(ast, (node) => ids.push(node.id));
    expect(ids).toEqual(expect.arrayContaining(['a', 'a1', 'p', 'p1', 'f']));
  });

  it('walks states via the SCXMLEngine.walkStates facade', () => {
    const xml = `
      <scxml version="1.0" initial="x">
        <state id="x"><state id="y" /></state>
        <final id="z" />
      </scxml>
    `;
    const ast = SCXMLEngine.parse(xml).data!;
    const ids: string[] = [];
    SCXMLEngine.walkStates(ast, (node) => ids.push(node.id));
    expect(ids).toContain('x');
    expect(ids).toContain('y');
    expect(ids).toContain('z');
  });

  it('walks every transition via walkTransitions, covering state/initial/history edges', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <initial><transition target="a1" /></initial>
          <transition event="GO" target="b" />
          <state id="a1" />
          <history id="h" type="deep"><transition target="a1" /></history>
        </state>
        <state id="b"><transition event="BACK" target="a" /></state>
      </scxml>
    `;
    const ast = SCXMLEngine.parse(xml).data!;
    const edges: string[] = [];
    walkTransitions(ast, (t, parent) => {
      edges.push(`${t.id}|${(parent as { id?: string }).id ?? 'initial'}`);
    });
    // State "a" transitions, initial-block transition, history transition, state "b" transition.
    expect(edges).toHaveLength(4);
    expect(edges).toEqual(expect.arrayContaining(['a:b|a', 'a:a1|initial', 'h:a1|h', 'b:a|b']));
  });

  it('walks transitions via the SCXMLEngine.walkTransitions facade', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><transition event="GO" target="b" /></state>
        <state id="b" />
      </scxml>
    `;
    const ast = SCXMLEngine.parse(xml).data!;
    const ids: string[] = [];
    SCXMLEngine.walkTransitions(ast, (t) => ids.push(t.id!));
    expect(ids).toEqual(['a:b']);
  });

  it('walks transitions inside nested parallel states', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <state id="s1"><transition event="E" target="s2" /></state>
          <state id="s2" />
        </parallel>
      </scxml>
    `;
    const ast = SCXMLEngine.parse(xml).data!;
    const ids: string[] = [];
    walkTransitions(ast, (t) => ids.push(t.id!));
    expect(ids).toEqual(['s1:s2']);
  });

  it('walks transitions in a parallel nested inside a parallel', () => {
    const xml = `
      <scxml version="1.0" initial="outer">
        <parallel id="outer">
          <parallel id="inner">
            <state id="s1"><transition event="E" target="s2" /></state>
            <state id="s2" />
          </parallel>
        </parallel>
      </scxml>
    `;
    const ast = SCXMLEngine.parse(xml).data!;
    const ids: string[] = [];
    walkTransitions(ast, (t) => ids.push(t.id!));
    expect(ids).toEqual(['s1:s2']);
  });

  it('walks transitions inside nested initial blocks', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <initial>
            <transition target="a1" />
            <initial>
              <transition target="a2" />
            </initial>
          </initial>
          <state id="a1" />
          <state id="a2" />
        </state>
      </scxml>
    `;
    const ast = SCXMLEngine.parse(xml).data!;
    const ids: string[] = [];
    walkTransitions(ast, (t) => ids.push(t.id!));
    // Outer initial derives from owning state "a"; inner initial also from "a".
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('a:a1');
  });

  it('walks multiple nested initial blocks (array form)', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <initial>
            <transition target="a1" />
            <initial><transition target="a2" /></initial>
            <initial><transition target="a3" /></initial>
          </initial>
          <state id="a1" />
          <state id="a2" />
          <state id="a3" />
        </state>
      </scxml>
    `;
    const ast = SCXMLEngine.parse(xml).data!;
    const ids: string[] = [];
    walkTransitions(ast, (t) => ids.push(t.id!));
    // Outer + two nested initial edges all derive from owning state "a".
    expect(ids).toEqual(['a:a1', 'a:a2', 'a:a3']);
  });

  it('walks an initial block that has no default transition', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <initial>
            <initial><transition target="a1" /></initial>
          </initial>
          <state id="a1" />
        </state>
      </scxml>
    `;
    const ast = SCXMLEngine.parse(xml).data!;
    const ids: string[] = [];
    walkTransitions(ast, (t) => ids.push(t.id!));
    // Outer initial has no direct transition; only the nested one is visited.
    expect(ids).toEqual(['a:a1']);
  });

  it('walks transitions in a parallel nested inside a state', () => {
    const xml = `
      <scxml version="1.0" initial="root">
        <state id="root">
          <parallel id="p">
            <state id="s1"><transition event="E" target="s2" /></state>
            <state id="s2" />
          </parallel>
        </state>
      </scxml>
    `;
    const ast = SCXMLEngine.parse(xml).data!;
    const ids: string[] = [];
    walkTransitions(ast, (t) => ids.push(t.id!));
    expect(ids).toEqual(['s1:s2']);
  });

  it('walks a history default transition nested inside a parallel', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <history id="hp"><transition target="s1" /></history>
          <state id="s1" />
        </parallel>
      </scxml>
    `;
    const ast = SCXMLEngine.parse(xml).data!;
    const ids: string[] = [];
    walkTransitions(ast, (t) => ids.push(t.id!));
    expect(ids).toEqual(['hp:s1']);
  });

  it('renders a Mermaid diagram via SCXMLEngine.toMermaid', () => {
    const ast = SCXMLEngine.parse(validXml).data!;
    const out = SCXMLEngine.toMermaid(ast);
    expect(out.split('\n')[0]).toBe('stateDiagram-v2');
    expect(out).toContain('[*] --> Draft');
  });

  it('exposes the SCXMLDocument type', () => {
    const doc: SCXMLDocument = {
      scxml: {
        version: '1.0',
        states: [],
        parallels: [],
        finals: [],
        scripts: [],
      },
    };
    expect(doc.scxml.version).toBe('1.0');
  });
});
