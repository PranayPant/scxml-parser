import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCXMLEngine } from '../src/index';
import { parseSCXML } from '../src/parser';
import { TagRegistry } from '../src/registry/TagRegistry';
import { serializeSCXML } from '../src/serializer';
import type { MetadataBlock } from '../src/types/ast';
import type { CustomASTNode } from '../src/types/extensibility';
import { validateAST } from '../src/validator';

/** A strongly-typed custom `<gate>` node for tests. */
interface GateASTNode extends CustomASTNode {
  tagName: 'gate';
  payload: { gateType: 'AND' | 'OR' | 'NOT'; ruleId: string };
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

describe('parser: custom tags in metadata', () => {
  beforeEach(() => registerGate());

  it('populates customChildren on a transition from a registered metadata tag', () => {
    const xml = `
      <scxml version="1.0" initial="Idle">
        <state id="Idle">
          <transition event="SUBMIT" target="Processing">
            <metadata>
              <gate type="AND" ruleId="rule_verify_credit" />
            </metadata>
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

  it('populates customChildren on a state from metadata', () => {
    const xml = `
      <scxml version="1.0">
        <state id="Idle">
          <metadata>
            <gate type="OR" ruleId="rule_a" />
          </metadata>
        </state>
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.states[0].customChildren).toHaveLength(1);
    expect(ast.scxml.states[0].customChildren![0].tagName).toBe('gate');
  });

  it('populates customChildren on a parallel and a final from metadata', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <metadata><gate type="AND" ruleId="rp" /></metadata>
          <state id="a" />
        </parallel>
        <final id="done">
          <metadata><gate type="NOT" ruleId="rf" /></metadata>
        </final>
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.parallels[0].customChildren).toHaveLength(1);
    expect(ast.scxml.finals[0].customChildren).toHaveLength(1);
  });

  it('preserves unregistered metadata children as opaque blocks', () => {
    const xml = `
      <scxml version="1.0">
        <state id="a">
          <metadata>
            <viz:note layout="true" x="4" />
          </metadata>
        </state>
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const blocks = ast.scxml.states[0].metadata as MetadataBlock[];
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].tag).toBe('viz:note');
    expect(blocks[0].attributes.layout).toBe('true');
  });

  it('warns when a registered tag appears outside metadata', () => {
    const xml = `
      <scxml version="1.0">
        <state id="a">
          <gate type="AND" ruleId="r1" />
        </state>
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    const diag = result.errors.find((d) => d.code === 'WARN_CUSTOM_TAG_OUTSIDE_METADATA');
    expect(diag).toBeDefined();
    expect(result.data!.scxml.states[0].customChildren).toBeUndefined();
  });

  it('warns when an unregistered tag appears inside metadata', () => {
    const xml = `
      <scxml version="1.0">
        <state id="a">
          <metadata>
            <unknownThing x="1" />
          </metadata>
        </state>
      </scxml>
    `;
    const result = parseSCXML(xml);
    expect(result.success).toBe(true);
    const diag = result.errors.find((d) => d.code === 'WARN_UNREGISTERED_METADATA_TAG');
    expect(diag).toBeDefined();
    expect(result.data!.scxml.states[0].customChildren).toBeUndefined();
  });

  it('handles metadata containing only plain text (no custom children)', () => {
    const xml = `<scxml version="1.0"><state id="a"><metadata>just text</metadata></state></scxml>`;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.states[0].customChildren).toBeUndefined();
  });

  it('ignores metadata element attributes when scanning children', () => {
    const xml = `
      <scxml version="1.0">
        <state id="a">
          <metadata kind="layout">
            <gate type="AND" ruleId="r1" />
          </metadata>
        </state>
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.states[0].customChildren).toHaveLength(1);
    expect(ast.scxml.states[0].customChildren![0].tagName).toBe('gate');
  });
});

describe('transition ids', () => {
  it('reads an id persisted in transition metadata', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><transitionId id="t_submit" /></metadata>
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const t = ast.scxml.states[0].transitions[0];
    expect(t.id).toBe('t_submit');
  });

  it('serializes an id set on the AST into transition metadata', () => {
    const ast = parseSCXML(
      '<scxml version="1.0" initial="a"><state id="a"><transition event="GO" target="b" /></state><state id="b" /></scxml>',
    ).data!;
    ast.scxml.states[0].transitions[0].id = 't_next';
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<transitionId');
    expect(out).toContain('t_next');
  });

  it('round-trips a transition id through parse -> serialize -> parse', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><transitionId id="t_persist" /></metadata>
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    const reparsed = parseSCXML(out).data!;
    expect(reparsed.scxml.states[0].transitions[0].id).toBe('t_persist');
  });

  it('derives a deterministic id when none is set', () => {
    const ast = parseSCXML(
      '<scxml version="1.0" initial="a"><state id="a"><transition event="GO" target="b" /></state><state id="b" /></scxml>',
    ).data!;
    expect(ast.scxml.states[0].transitions[0].id).toBe('a:b');
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<transitionId');
    expect(out).toContain('a:b');
  });

  it('suffixes duplicate derived ids between the same source->target pair', () => {
    const ast = parseSCXML(
      '<scxml version="1.0" initial="a"><state id="a"><transition event="E1" target="b" /><transition event="E2" target="b" /></state><state id="b" /></scxml>',
    ).data!;
    const ids = ast.scxml.states[0].transitions.map((t) => t.id);
    expect(ids).toEqual(['a:b', 'a:b_1']);
  });

  it('lets an explicit id win over the deterministic derivation', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><transitionId id="t_custom" /></metadata>
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.states[0].transitions[0].id).toBe('t_custom');
  });

  it('round-trips a derived id so it stays stable across parse -> serialize -> parse', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><transition event="GO" target="b" /></state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.states[0].transitions[0].id).toBe('a:b');
    const out = serializeSCXML(ast, { pretty: true });
    const reparsed = parseSCXML(out).data!;
    expect(reparsed.scxml.states[0].transitions[0].id).toBe('a:b');
  });

  it('reads a transition id from the text form of a transitionId block', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><transitionId>t_text_id</transitionId></metadata>
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.states[0].transitions[0].id).toBe('t_text_id');
  });

  it('falls back to a derived id when a transitionId block is empty', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><transitionId /></metadata>
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.states[0].transitions[0].id).toBe('a:b');
  });

  it('ignores whitespace-only transitionId text and derives an id', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><transitionId>   </transitionId></metadata>
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.states[0].transitions[0].id).toBe('a:b');
  });

  it('serializes a manual transition with no id and no metadata without error', () => {
    // A hand-built transition (no derived/persisted id and no metadata) must
    // serialize cleanly: the serializer skips the transitionId block.
    const ast = {
      scxml: {
        version: '1.0',
        initial: 'a',
        states: [
          {
            id: 'a',
            transitions: [{ event: 'GO', target: 'b', executable: [] }],
            states: [],
            parallels: [],
            finals: [],
            history: [],
            invoke: [],
            metadata: [],
          },
        ],
        parallels: [],
        finals: [],
        scripts: [],
        metadata: [],
      },
    };
    const out = serializeSCXML(ast as never, { pretty: true });
    expect(out).toContain('<transition event="GO" target="b"');
    expect(out).not.toContain('transitionId');
  });

  it('persists a manually-set id on a transition with no other metadata', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><transition event="GO" target="b" /></state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const t = ast.scxml.states[0].transitions[0];
    // Replace the derived metadata with just a manually-assigned id.
    t.id = 't_manual';
    // Keep metadata but strip the auto-persisted block to mimic a bare id set.
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<transitionId');
    expect(out).toContain('t_manual');
    expect(out).not.toContain('a:b');
  });

  it('reads a transition id from the value attribute fallback', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><transitionId value="t_val" /></metadata>
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.states[0].transitions[0].id).toBe('t_val');
  });

  it('prepends a transitionId block when the transition also has other metadata', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><viz:note x="1" /></metadata>
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    ast.scxml.states[0].transitions[0].id = 't_meta';
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<transitionId');
    expect(out).toContain('t_meta');
    expect(out).toContain('viz:note');
  });
});

describe('validator: custom tags', () => {
  beforeEach(() => registerGate());

  it('accepts a custom tag in metadata inside an allowed parent', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><gate type="AND" ruleId="r1" /></metadata>
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(validateAST(ast)).toEqual([]);
  });

  it('emits ERR_CUSTOM_TAG_INVALID_PARENT when the parent violates allowedParents', () => {
    const xml = `<scxml version="1.0"><metadata><gate type="AND" ruleId="r1" /></metadata></scxml>`;
    const ast = parseSCXML(xml).data!;
    const diagnostics = validateAST(ast);
    expect(diagnostics.some((d) => d.code === 'ERR_CUSTOM_TAG_INVALID_PARENT')).toBe(true);
  });

  it('runs the custom validate hook and surfaces its diagnostics', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><gate type="AND" /></metadata>
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const diagnostics = validateAST(ast);
    expect(diagnostics.some((d) => d.code === 'ERR_GATE_RULE_ID_REQUIRED')).toBe(true);
  });

  it('validates custom children attached directly to a state', () => {
    const xml = `
      <scxml version="1.0">
        <state id="a">
          <metadata><gate type="OR" ruleId="ra" /></metadata>
        </state>
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    expect(validateAST(ast)).toEqual([]);
  });

  it('does not validate unregistered metadata children', () => {
    const xml = `<scxml version="1.0"><metadata><unknownX /></metadata></scxml>`;
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

  it('serializes custom children inside a metadata container', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><gate type="AND" ruleId="r1" /></metadata>
          </transition>
        </state>
        <state id="b" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<metadata>');
    expect(out).toContain('<gate type="AND" ruleId="r1" />');
  });

  it('falls back to generic formatting when a custom tag has no serialize hook', () => {
    const registry = TagRegistry.getInstance();
    registry.register({
      tagName: 'flag',
      parse: (ctx) => ({
        type: 'custom',
        tagName: 'flag',
        attributes: ctx.attributes,
      }),
    });
    const xml = `<scxml version="1.0"><metadata><flag enabled="true" /></metadata></scxml>`;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<flag enabled="true" />');
  });

  it('wraps custom tag text content in the generic fallback', () => {
    const registry = TagRegistry.getInstance();
    registry.register({
      tagName: 'note',
      parse: (ctx) => ({
        type: 'custom',
        tagName: 'note',
        attributes: ctx.attributes,
        textContent: ctx.textContent ?? '',
      }),
    });
    const xml = `<scxml version="1.0"><metadata><note author="me">hi</note></metadata></scxml>`;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<note author="me">');
    expect(out).toContain('hi');
  });

  it('does not emit a metadata container for parallel/final without layout', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <state id="a" />
        </parallel>
        <final id="done" />
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).not.toContain('<metadata>');
    expect(out).toContain('<parallel id="p">');
    expect(out).toContain('<final id="done" />');
  });

  it('serializes custom children on a parallel and a final', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <metadata><gate type="AND" ruleId="rp" /></metadata>
          <state id="a" />
        </parallel>
        <final id="done">
          <metadata><gate type="NOT" ruleId="rf" /></metadata>
        </final>
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    expect(out).toContain('<parallel id="p">');
    expect(out).toContain('<gate type="AND" ruleId="rp" />');
    expect(out).toContain('<final id="done">');
    expect(out).toContain('<gate type="NOT" ruleId="rf" />');
  });

  it('round-trips a custom tag through parse -> serialize -> parse', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b">
            <metadata><gate type="OR" ruleId="r2" /></metadata>
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

  it('preserves opaque metadata blocks through a round-trip', () => {
    const xml = `
      <scxml version="1.0">
        <state id="a">
          <metadata>
            <viz:note layout="true" x="9" />
          </metadata>
        </state>
      </scxml>
    `;
    const ast = parseSCXML(xml).data!;
    const out = serializeSCXML(ast, { pretty: true });
    const reparsed = parseSCXML(out).data!;
    const blocks = reparsed.scxml.states[0].metadata as MetadataBlock[];
    expect(blocks[0].tag).toBe('viz:note');
    expect(blocks[0].attributes.x).toBe('9');
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
