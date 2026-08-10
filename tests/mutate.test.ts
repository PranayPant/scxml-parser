import { describe, expect, it } from 'vitest';
import {
  addState,
  addTransition,
  parseSCXML,
  removeState,
  removeTransition,
  renameState,
  serializeSCXML,
} from '../src/index';

const xml = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <state id="a">
    <transition event="GO" target="b" />
    <transition event="MULTI" target="b c" />
  </state>
  <state id="b" initial="b1">
    <state id="b1" />
  </state>
  <state id="c" />
</scxml>
`;

describe('renameState', () => {
  it('renames the node id', () => {
    const doc = parseSCXML(xml).data!;
    renameState(doc, 'b', 'bee');
    expect(doc.scxml.states.find((s) => s.id === 'bee')).toBeDefined();
    expect(doc.scxml.states.find((s) => s.id === 'b')).toBeUndefined();
  });

  it('cascades to single and multi-target transition lists', () => {
    const doc = parseSCXML(xml).data!;
    renameState(doc, 'b', 'bee');
    const a = doc.scxml.states.find((s) => s.id === 'a')!;
    expect(a.transitions[0].target).toBe('bee');
    expect(a.transitions[1].target).toBe('bee c');
  });

  it('cascades into nested initial attributes', () => {
    const doc = parseSCXML(xml).data!;
    // b has initial="b1"; rename b1 -> bee1
    renameState(doc, 'b1', 'bee1');
    const b = doc.scxml.states.find((s) => s.id === 'b')!;
    expect(b.initial).toBe('bee1');
  });

  it('cascades into the document initial attribute', () => {
    const doc = parseSCXML(xml).data!;
    renameState(doc, 'a', 'alpha');
    expect(doc.scxml.initial).toBe('alpha');
  });

  it('keeps the renamed document serializeable', () => {
    const doc = parseSCXML(xml).data!;
    renameState(doc, 'b', 'bee');
    const out = serializeSCXML(doc, { pretty: true });
    expect(out).toContain('id="bee"');
    expect(out).toContain('target="bee"');
    expect(out).not.toContain('target="b"');
  });

  it('renames a root-level <final> node and its incoming transition targets', () => {
    const fxml = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <state id="a">
    <transition event="done" target="finished" />
  </state>
  <final id="finished" />
</scxml>
`;
    const doc = parseSCXML(fxml).data!;
    renameState(doc, 'finished', 'complete');
    expect(doc.scxml.finals.find((f) => f.id === 'complete')).toBeDefined();
    expect(doc.scxml.finals.find((f) => f.id === 'finished')).toBeUndefined();
    // The incoming transition now targets the renamed final.
    const a = doc.scxml.states.find((s) => s.id === 'a')!;
    expect(a.transitions[0].target).toBe('complete');
  });

  it('renames a nested <final> inside a state', () => {
    const nxml = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <state id="a">
    <final id="end" />
  </state>
</scxml>
`;
    const doc = parseSCXML(nxml).data!;
    renameState(doc, 'end', 'terminate');
    const a = doc.scxml.states.find((s) => s.id === 'a')!;
    expect(a.finals.find((f) => f.id === 'terminate')).toBeDefined();
    expect(a.finals.find((f) => f.id === 'end')).toBeUndefined();
  });
});

describe('removeState', () => {
  it('removes the node', () => {
    const doc = parseSCXML(xml).data!;
    removeState(doc, 'c');
    expect(doc.scxml.states.find((s) => s.id === 'c')).toBeUndefined();
  });

  it('filters a dangling multi-target, preserving other targets', () => {
    const doc = parseSCXML(xml).data!;
    // transition target "b c"; remove c -> target becomes "b"
    removeState(doc, 'c');
    const a = doc.scxml.states.find((s) => s.id === 'a')!;
    expect(a.transitions[1].target).toBe('b');
  });

  it('keeps an event transition as targetless when its only target is deleted', () => {
    const doc = parseSCXML(xml).data!;
    // a's GO transition has an event but no other meaning. Per policy, a
    // transition with an event is preserved as a targetless handler.
    removeState(doc, 'b');
    const a = doc.scxml.states.find((s) => s.id === 'a')!;
    const go = a.transitions.find((t) => t.event === 'GO');
    expect(go).toBeDefined();
    expect(go!.target).toBeUndefined();
    // The multi-target transition had "b c"; removing b leaves "c".
    expect(a.transitions.find((t) => t.event === 'MULTI')!.target).toBe('c');
  });

  it('removes a pure navigational arrow (no event/cond/exec) when its only target is deleted', () => {
    const pureXml = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <state id="a">
    <transition target="b" />
  </state>
  <state id="b" />
</scxml>
`;
    const doc = parseSCXML(pureXml).data!;
    removeState(doc, 'b');
    const a = doc.scxml.states.find((s) => s.id === 'a')!;
    expect(a.transitions).toHaveLength(0);
  });

  it('keeps a transition as targetless when it carries an event and executable', () => {
    const doc = parseSCXML(addXml).data!;
    removeState(doc, 'dead');
    const src = doc.scxml.states.find((s) => s.id === 'src')!;
    const t = src.transitions.find((x) => x.event === 'EVT');
    expect(t).toBeDefined();
    expect(t!.target).toBeUndefined();
    expect(t!.executable).toHaveLength(1);
  });
});

describe('addState', () => {
  it('appends to the document root when parentId is null', () => {
    const doc = parseSCXML(xml).data!;
    const node = addState(doc, null, { id: 'newState' });
    expect(node.transitions).toEqual([]);
    expect(node.states).toEqual([]);
    expect(doc.scxml.states.find((s) => s.id === 'newState')).toBe(node);
  });

  it('appends to a parent state by id', () => {
    const doc = parseSCXML(xml).data!;
    addState(doc, 'a', { id: 'nested', type: 'atomic' });
    const a = doc.scxml.states.find((s) => s.id === 'a')!;
    expect(a.states.find((s) => s.id === 'nested')?.type).toBe('atomic');
  });
});

describe('addTransition', () => {
  it('constructs a well-formed transition and appends to the source', () => {
    const doc = parseSCXML(xml).data!;
    const t = addTransition(doc, 'a', 'c', 'NEXT');
    expect(t.target).toBe('c');
    expect(t.event).toBe('NEXT');
    expect(t.type).toBe('external');
    expect(t.executable).toEqual([]);
    expect(t.id).toBe('a:c');
    const a = doc.scxml.states.find((s) => s.id === 'a')!;
    expect(a.transitions[a.transitions.length - 1]).toBe(t);
  });

  it('derives a non-colliding id when the pair exists', () => {
    const doc = parseSCXML(xml).data!;
    // a:c not yet present; add one, then another.
    addTransition(doc, 'a', 'c', 'X');
    const t2 = addTransition(doc, 'a', 'c', 'Y');
    expect(t2.id).toBe('a:c_1');
  });

  it('throws when the source is missing', () => {
    const doc = parseSCXML(xml).data!;
    expect(() => addTransition(doc, 'ghost', 'c', 'E')).toThrow(/ghost/);
  });

  it('honors options (type, cond, executable, metadata)', () => {
    const doc = parseSCXML(xml).data!;
    const t = addTransition(doc, 'a', 'c', 'OPTS', {
      type: 'internal',
      cond: 'x > 1',
      executable: [{ kind: 'log', label: 'hi' }],
      metadata: [{ tag: 'viz:note', attributes: { id: 'n' } }],
    });
    expect(t.type).toBe('internal');
    expect(t.cond).toBe('x > 1');
    expect(t.executable).toHaveLength(1);
    expect(t.metadata).toHaveLength(1);
  });
});

describe('mutation across nested state/parallel regions', () => {
  it('renames a state nested inside a parallel and a state->parallel region', () => {
    const nestedPar = `<?xml version="1.0"?>
<scxml version="1.0" initial="outer">
  <state id="outer">
    <parallel id="p">
      <state id="in-par"><transition event="E" target="leaf" /></state>
    </parallel>
    <state id="leaf" />
  </state>
</scxml>
`;
    const doc = parseSCXML(nestedPar).data!;
    renameState(doc, 'leaf', 'renamedLeaf');
    const parallel = doc.scxml.states[0].parallels[0];
    expect(parallel.states[0].transitions[0].target).toBe('renamedLeaf');
  });

  it('removes a state nested inside a parallel region', () => {
    const nestedPar = `<?xml version="1.0"?>
<scxml version="1.0" initial="p">
  <parallel id="p">
    <state id="doomed" /><state id="keep" />
  </parallel>
</scxml>
`;
    const doc = parseSCXML(nestedPar).data!;
    removeState(doc, 'doomed');
    const p = doc.scxml.parallels[0];
    expect(p.states.find((s) => s.id === 'doomed')).toBeUndefined();
    expect(p.states.find((s) => s.id === 'keep')).toBeDefined();
  });

  it('handles a parallel nested inside a parallel', () => {
    const doublePar = `<?xml version="1.0"?>
<scxml version="1.0" initial="outer">
  <parallel id="outer">
    <parallel id="inner"><state id="leaf" /></parallel>
  </parallel>
</scxml>
`;
    const doc = parseSCXML(doublePar).data!;
    renameState(doc, 'leaf', 'renamedLeaf');
    const inner = doc.scxml.parallels[0].parallels[0];
    expect(inner.states.find((s) => s.id === 'renamedLeaf')).toBeDefined();
  });

  it('renames through nested initial blocks', () => {
    const nestedInit = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <state id="a">
    <initial>
      <initial><transition target="deep" /></initial>
    </initial>
    <state id="deep" />
  </state>
</scxml>
`;
    const doc = parseSCXML(nestedInit).data!;
    renameState(doc, 'deep', 'renamedDeep');
    const a = doc.scxml.states[0];
    expect(a.initialBlock!.blocks![0].transition![0].target).toBe('renamedDeep');
  });

  it('prunes a dangling transition inside an <initial> block when removing a state', () => {
    const initTarget = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <state id="a">
    <initial><transition target="gone" /></initial>
  </state>
  <state id="gone" />
</scxml>
`;
    const doc = parseSCXML(initTarget).data!;
    removeState(doc, 'gone');
    const a = doc.scxml.states[0];
    expect(a.initialBlock!.transition).toHaveLength(0);
  });
});

describe('removeTransition', () => {
  it('removes a transition by id from a state', () => {
    const doc = parseSCXML(xml).data!;
    const a = doc.scxml.states.find((s) => s.id === 'a')!;
    const firstId = a.transitions[0].id!;
    removeTransition(doc, firstId);
    expect(a.transitions.find((t) => t.id === firstId)).toBeUndefined();
  });

  it('removes a transition from an <initial> block and a <history>', () => {
    const deepXml = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <state id="a">
    <initial><transition target="a1" /></initial>
    <history id="h"><transition target="a1" /></history>
    <state id="a1" />
  </state>
</scxml>
`;
    const doc = parseSCXML(deepXml).data!;
    const a = doc.scxml.states[0];
    const initId = a.initialBlock!.transition![0].id!;
    const histId = a.history[0].transition!.id!;
    removeTransition(doc, initId);
    removeTransition(doc, histId);
    expect(a.initialBlock!.transition).toHaveLength(0);
    expect(a.history[0].transition).toBeUndefined();
  });
});

describe('mutation cascades into initial/history and nested nodes', () => {
  it('renames a state referenced by an <initial> block and a <history> default transition', () => {
    const deepXml = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <state id="a">
    <initial><transition target="target" /></initial>
    <history id="h"><transition target="target" /></history>
    <state id="target" />
  </state>
</scxml>
`;
    const doc = parseSCXML(deepXml).data!;
    renameState(doc, 'target', 'renamed');
    const a = doc.scxml.states[0];
    expect(a.initialBlock!.transition![0].target).toBe('renamed');
    expect(a.history[0].transition!.target).toBe('renamed');
  });

  it('removes a nested state and prunes a dangling history transition', () => {
    const nested = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <state id="a">
    <history id="h"><transition target="victim" /></history>
    <state id="victim" />
  </state>
</scxml>
`;
    const doc = parseSCXML(nested).data!;
    removeState(doc, 'victim');
    const a = doc.scxml.states[0];
    expect(a.states.find((s) => s.id === 'victim')).toBeUndefined();
    // history's default transition pointed only at victim -> removed (has no event/cond/exec)
    expect(a.history[0].transition).toBeUndefined();
  });

  it('removes a parallel and a final state node', () => {
    const mix = `<?xml version="1.0"?>
<scxml version="1.0" initial="p">
  <parallel id="p"><state id="p1" /></parallel>
  <final id="f" />
</scxml>
`;
    const doc = parseSCXML(mix).data!;
    removeState(doc, 'p');
    removeState(doc, 'f');
    expect(doc.scxml.parallels.find((p) => p.id === 'p')).toBeUndefined();
    expect(doc.scxml.finals.find((f) => f.id === 'f')).toBeUndefined();
  });

  it("clears a nested state's initial attribute when the referenced child is removed", () => {
    const withInit = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <state id="a" initial="kid">
    <state id="kid" />
  </state>
</scxml>
`;
    const doc = parseSCXML(withInit).data!;
    removeState(doc, 'kid');
    const a = doc.scxml.states[0];
    expect(a.initial).toBe('');
  });
});

describe('addState optional config', () => {
  it('honors initial and initialBlock config', () => {
    const doc = parseSCXML(xml).data!;
    const node = addState(doc, null, {
      id: 'cfg',
      initial: 'child',
      initialBlock: { transition: [] },
    });
    expect(node.initial).toBe('child');
    expect(node.initialBlock).toEqual({ transition: [] });
  });
});

const addXml = `<?xml version="1.0"?>
<scxml version="1.0" initial="src">
  <state id="src">
    <transition event="EVT" target="dead">
      <assign location="x" expr="1" />
    </transition>
  </state>
  <state id="dead" />
</scxml>
`;
