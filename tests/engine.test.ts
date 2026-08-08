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
