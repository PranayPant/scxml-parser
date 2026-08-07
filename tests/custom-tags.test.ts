import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCXMLEngine } from '../src/index';
import { parseSCXML } from '../src/parser';
import { TagRegistry } from '../src/registry/TagRegistry';
import { serializeSCXML } from '../src/serializer';
import type { CustomASTNode } from '../src/types/extensibility';
import { validateAST } from '../src/validator';

/** A strongly-typed custom `<gate>` node for tests. */
interface GateASTNode extends CustomASTNode {
  tagName: 'gate';
  payload: { gateType: 'AND' | 'OR' | 'NOT'; ruleId: string };
}

/** A strongly-typed custom `<note>` node (text content, no payload). */
interface NoteASTNode extends CustomASTNode {
  tagName: 'note';
  textContent: string;
}

/** Registers a `<gate>` spec that mimics the CUSTOM_TAG.md example. */
function registerGate(registry: TagRegistry = TagRegistry.getInstance()): void {
  registry.register<GateASTNode>({
    tagName: 'gate',
    allowedParents: ['transition', 'state'],
    parse: (ctx) => ({
      type: 'custom',
      tagName: 'gate',
      attributes: ctx.attributes,
      payload: {
        gateType: (ctx.attributes.type as 'AND' | 'OR' | 'NOT') || 'AND',
        ruleId: ctx.attributes.ruleId || '',
      },
    }),
    validate: (node) => {
      const errors = [];
      if (!node.payload.ruleId) {
        errors.push({
          severity: 'error' as const,
          code: 'ERR_GATE_RULE_ID_REQUIRED' as const,
          message: '<gate> element requires a non-empty "ruleId" attribute.',
        });
      }
      return errors;
    },
    serialize: (node, indentLevel) => {
      const indent = '  '.repeat(indentLevel);
      return `${indent}<gate type="${node.payload.gateType}" ruleId="${node.payload.ruleId}" />`;
    },
  });
}

describe('TagRegistry', () => {
  beforeEach(() => {
    TagRegistry.getInstance().clear();
  });
  afterEach(() => {
    TagRegistry.getInstance().clear();
  });

  it('exposes a process-wide singleton', () => {
    expect(TagRegistry.getInstance()).toBe(TagRegistry.getInstance());
  });

  it('registers and retrieves specs case-insensitively', () => {
    const registry = TagRegistry.getInstance();
    registerGate(registry);
    expect(registry.has('gate')).toBe(true);
    expect(registry.has('GATE')).toBe(true);
    expect(registry.get('Gate')).toBeDefined();
    expect(registry.get('Gate')?.tagName).toBe('gate');
    expect(registry.size).toBe(1);
  });

  it('returns undefined/gives false for unregistered tags', () => {
    const registry = TagRegistry.getInstance();
    expect(registry.has('missing')).toBe(false);
    expect(registry.get('missing')).toBeUndefined();
  });

  it('supports chaining and unregistering', () => {
    const registry = TagRegistry.getInstance();
    registerGate(registry);
    expect(registry.unregister('GATE')).toBe(true);
    expect(registry.has('gate')).toBe(false);
    expect(registry.unregister('gate')).toBe(false);
  });

  it('clear removes all specs', () => {
    const registry = TagRegistry.getInstance();
    registerGate(registry);
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.has('gate')).toBe(false);
  });
});

describe('parser: custom tags', () => {
  beforeEach(() => registerGate());

  it('populates customChildren on a transition with a registered tag', () => {
    const xml = `
      <scxml version="1.0" initial="Idle">
        <state id="Idle">
          <transition event="SUBMIT" target="Processing">
            <gate type="AND" ruleId="rule_verify_credit" />
          </transition>
        </state>
        <state id="Processing" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const t = ast.scxml.states[0].transitions[0];
    expect(t.customChildren).toBeDefined();
    expect(t.customChildren).toHaveLength(1);
    const gate = t.customChildren![0] as GateASTNode;
    expect(gate.tagName).toBe('gate');
    expect(gate.payload?.gateType).toBe('AND');
    expect(gate.payload?.ruleId).toBe('rule_verify_credit');
  });

  it('populates customChildren on a state and the root element', () => {
    const xml = `
      <scxml version="1.0">
        <state id="Idle">
          <gate type="OR" ruleId="rule_a" />
        </state>
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.states[0].customChildren).toHaveLength(1);
    expect(ast.scxml.states[0].customChildren![0].tagName).toBe('gate');
  });

  it('populates customChildren on a parallel node', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <gate type="AND" ruleId="rule_p" />
          <state id="a" />
          <state id="b" />
        </parallel>
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.parallels[0].customChildren).toHaveLength(1);
    expect(ast.scxml.parallels[0].customChildren![0].tagName).toBe('gate');
  });

  it('routes a registered root-level custom tag to customChildren, not metadata', () => {
    const xml = `<scxml version="1.0"><gate type="NOT" ruleId="r" /></scxml>`;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.metadata).toHaveLength(0);
    expect(ast.scxml.customChildren).toHaveLength(1);
  });

  it('preserves textContent and attributes from the raw node', () => {
    const registry = TagRegistry.getInstance();
    registry.register<NoteASTNode>({
      tagName: 'note',
      parse: (ctx) => ({
        type: 'custom',
        tagName: 'note',
        attributes: ctx.attributes,
        textContent: ctx.textContent ?? '',
      }),
    });
    const xml = `<scxml version="1.0"><note author="me">hello &amp; goodbye</note></scxml>`;
    const ast = parseSCXML(xml).data!;
    const note = ast.scxml.customChildren![0] as NoteASTNode;
    expect(note.attributes.author).toBe('me');
    expect(note.textContent).toBe('hello & goodbye');
  });

  it('does not populate customChildren when a tag is unregistered', () => {
    const xml = `<scxml version="1.0"><unknownTag x="1" /></scxml>`;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.customChildren).toBeUndefined();
    // Unregistered unknown tags are preserved as metadata instead.
    expect(ast.scxml.metadata.length).toBeGreaterThan(0);
  });
});

describe('validator: custom tags', () => {
  beforeEach(() => registerGate());

  it('accepts a custom tag inside an allowed parent', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <gate type="AND" ruleId="r1" />
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(validateAST(ast)).toEqual([]);
  });

  it('emits ERR_CUSTOM_TAG_INVALID_PARENT when the parent violates allowedParents', () => {
    const xml = `<scxml version="1.0"><gate type="AND" ruleId="r1" /></scxml>`;
    const ast = parseSCXML(xml).data!;
    const diagnostics = validateAST(ast);
    expect(diagnostics.some((d) => d.code === 'ERR_CUSTOM_TAG_INVALID_PARENT')).toBe(true);
  });

  it('runs the custom validate hook and surfaces its diagnostics', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <gate type="AND" />
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const diagnostics = validateAST(ast);
    expect(diagnostics.some((d) => d.code === 'ERR_GATE_RULE_ID_REQUIRED')).toBe(true);
  });

  it('applies scoping/hooks to custom tags on a state', () => {
    // gate allows 'state' as a parent, and ruleId is provided -> valid.
    const xml = `
      <scxml version="1.0">
        <state id="Idle">
          <gate type="OR" ruleId="rule_a" />
        </state>
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(validateAST(ast)).toEqual([]);
  });

  it('skips custom children whose tag is not registered', () => {
    const ast = parseSCXML(`<scxml version="1.0"><state id="a" /></scxml>`).data!;
    // Simulate a manually-constructed AST with an unknown custom child.
    ast.scxml.states[0].customChildren = [{ type: 'custom', tagName: 'ghost', attributes: {} }];
    expect(validateAST(ast)).toEqual([]);
  });
});

describe('serializer: custom tags', () => {
  beforeEach(() => registerGate());

  it('uses the registered serialize hook to render a custom tag', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <gate type="AND" ruleId="r1" />
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<gate type="AND" ruleId="r1" />');
  });

  it('falls back to generic XML formatting when no serialize hook is registered', () => {
    const registry = TagRegistry.getInstance();
    registry.register<NoteASTNode>({
      tagName: 'note',
      parse: (ctx) => ({
        type: 'custom',
        tagName: 'note',
        attributes: ctx.attributes,
        textContent: ctx.textContent ?? '',
      }),
    });
    const xml = `<scxml version="1.0"><note author="me">text</note></scxml>`;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<note author="me">');
  });

  it('serializes a transition that has both executable content and a custom child', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <log label="probe" expr="1" />
            <gate type="AND" ruleId="r1" />
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<log label="probe"');
    expect(out).toContain('<gate type="AND" ruleId="r1" />');
  });

  it('self-closes a custom tag with no text and no serialize hook', () => {
    const registry = TagRegistry.getInstance();
    registry.register({
      tagName: 'flag',
      parse: (ctx) => ({
        type: 'custom',
        tagName: 'flag',
        attributes: ctx.attributes,
      }),
    });
    const xml = `<scxml version="1.0"><flag enabled="true" /></scxml>`;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<flag enabled="true" />');
  });

  it('serializes a custom tag on a state and a parallel', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <gate type="AND" ruleId="rp" />
          <state id="a">
            <gate type="OR" ruleId="ra" />
          </state>
        </parallel>
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<gate type="AND" ruleId="rp" />');
    expect(out).toContain('<gate type="OR" ruleId="ra" />');
  });

  it('round-trips a custom tag through parse -> serialize -> parse', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <gate type="OR" ruleId="r2" />
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    const reparsed = parseSCXML(out).data!;
    const gate = reparsed.scxml.states[0].transitions[0].customChildren![0] as GateASTNode;
    expect(gate.payload?.gateType).toBe('OR');
    expect(gate.payload?.ruleId).toBe('r2');
  });
});

describe('SCXMLEngine facade', () => {
  it('registers tags via SCXMLEngine.registerTag', () => {
    SCXMLEngine.registerTag<GateASTNode>({
      tagName: 'policy',
      parse: (ctx) => ({
        type: 'custom',
        tagName: 'policy',
        attributes: ctx.attributes,
        payload: { name: ctx.attributes.name || '' },
      }),
    });
    expect(TagRegistry.getInstance().has('POLICY')).toBe(true);
  });
});
