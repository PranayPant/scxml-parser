import { describe, expect, it } from 'vitest';
import { parseSCXML } from '../src/parser';
import { serializeSCXML, unescapeXML } from '../src/serializer';
import type { SCXMLDocument } from '../src/types';
import { validateAST } from '../src/validator';

/** Helper: parse, then return re-serialized XML. */
function rt(xml: string): { out: string; doc: SCXMLDocument } {
  const result = parseSCXML(xml);
  expect(result.success).toBe(true);
  const doc = result.data!;
  return { out: serializeSCXML(doc, { pretty: true }), doc };
}

describe('targeted coverage: final states with executable content', () => {
  it('parses and serializes final onentry/onexit/donedata with params', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a" />
        <final id="f">
          <onentry><log label="in" expr="x" /></onentry>
          <onexit><log label="out" /></onexit>
          <donedata>
            <content>textual payload</content>
            <param name="r" expr="result" />
          </donedata>
        </final>
      </scxml>
    `;
    const { out, doc } = rt(xml);
    const final = doc.scxml.finals[0];
    expect(final.onentry).toHaveLength(1);
    expect(final.onexit).toHaveLength(1);
    expect(final.donedata?.content?.text).toBe('textual payload');
    expect(final.donedata?.param).toHaveLength(1);
    expect(out).toContain('<final id="f">');
    expect(out).toContain('textual payload');
  });
});

describe('targeted coverage: history defaults and transitions', () => {
  it('parses a history with a default transition', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a" initial="b">
          <history id="h">
            <transition target="b" />
          </history>
          <state id="b" />
        </state>
      </scxml>
    `;
    const { doc } = rt(xml);
    expect(doc.scxml.states[0].history[0].transition?.target).toBe('b');
    expect(validateAST(doc)).toHaveLength(0);
  });
});

describe('targeted coverage: nested initial blocks', () => {
  it('parses and serializes nested <initial> blocks', () => {
    const xml = `
      <scxml version="1.0" initial="outer">
        <state id="outer">
          <initial>
            <transition target="inner" />
            <initial><transition target="inner" /></initial>
          </initial>
          <state id="inner" />
        </state>
      </scxml>
    `;
    const { out, doc } = rt(xml);
    const block = doc.scxml.states[0].initialBlock!;
    expect(block.blocks).toBeDefined();
    expect(out).toContain('<initial>');
    expect(validateAST(doc)).toHaveLength(0);
  });
});

describe('targeted coverage: send with all attributes', () => {
  it('serializes every send attribute', () => {
    const doc: SCXMLDocument = {
      scxml: {
        version: '1.0',
        states: [
          {
            id: 'a',
            transitions: [],
            states: [],
            parallels: [],
            finals: [],
            history: [],
            invoke: [],
            onentry: [
              {
                kind: 'send',
                event: 'E',
                eventexpr: 'f()',
                target: '#scxml',
                targetexpr: 'id()',
                type: 'scxml',
                typeexpr: 't()',
                id: 's1',
                idlocation: 'loc',
                delay: '1s',
                delayexpr: 'd()',
                namelist: 'x y',
                param: [{ name: 'p', location: 'loc2' }],
                content: { expr: 'c' },
              },
            ],
          },
        ],
        parallels: [],
        finals: [],
        scripts: [],
        metadata: [],
      },
    };
    const out = serializeSCXML(doc);
    expect(out).toContain('eventexpr="f()"');
    expect(out).toContain('targetexpr="id()"');
    expect(out).toContain('typeexpr="t()"');
    expect(out).toContain('idlocation="loc"');
    expect(out).toContain('delayexpr="d()"');
    expect(out).toContain('namelist="x y"');
    expect(out).toContain('location="loc2"');
    expect(out).toContain('expr="c"');
  });
});

describe('targeted coverage: invoke variants', () => {
  it('parses invoke with idlocation/srcexpr and autoforward false', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <invoke idlocation="idLoc" srcexpr="srcExpr()" autoforward="false" />
        </state>
      </scxml>
    `;
    const { out } = rt(xml);
    expect(out).toContain('idlocation="idLoc"');
    expect(out).toContain('srcexpr="srcExpr()"');
    expect(out).toContain('autoforward="false"');
  });

  it('parses invoke with param location', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <invoke><param name="p" location="slot" /></invoke>
        </state>
      </scxml>
    `;
    const { doc } = rt(xml);
    expect(doc.scxml.states[0].invoke[0].param?.[0].location).toBe('slot');
  });
});

describe('targeted coverage: unescapeXML', () => {
  it('decodes all five XML entities', () => {
    expect(unescapeXML('&amp;&lt;&gt;&quot;&apos;')).toBe('&<>"\'');
  });

  it('leaves unknown entity-ish text untouched', () => {
    expect(unescapeXML('&unknown;')).toBe('&unknown;');
  });
});

describe('targeted coverage: metadata with numeric text', () => {
  it('preserves numeric metadata text', () => {
    const doc: SCXMLDocument = {
      scxml: {
        version: '1.0',
        states: [],
        parallels: [],
        finals: [],
        scripts: [],
        metadata: [{ tag: 'viz:note', attributes: { id: 'n' }, text: 42 }],
      },
    };
    const out = serializeSCXML(doc, { pretty: false });
    expect(out).toContain('>42</viz:note>');
  });
});

describe('targeted coverage: root datamodel binding + scripts with src', () => {
  it('round-trips root scripts with src and datamodel binding string', () => {
    const xml = `
      <scxml version="1.0" datamodel="ecmascript" initial="a">
        <script src="ext.js" />
        <state id="a" />
      </scxml>
    `;
    const { out, doc } = rt(xml);
    expect(doc.scxml.datamodel).toBe('ecmascript');
    expect(doc.scxml.scripts?.[0].src).toBe('ext.js');
    expect(out).toContain('datamodel="ecmascript"');
    expect(out).toContain('src="ext.js"');
  });
});

describe('targeted coverage: cancel with both sendid variants', () => {
  it('serializes cancel with sendidexpr', () => {
    const doc: SCXMLDocument = {
      scxml: {
        version: '1.0',
        states: [
          {
            id: 'a',
            transitions: [],
            states: [],
            parallels: [],
            finals: [],
            history: [],
            invoke: [],
            onentry: [{ kind: 'cancel', sendid: 'x', sendidexpr: 'y()' }],
          },
        ],
        parallels: [],
        finals: [],
        scripts: [],
        metadata: [],
      },
    };
    const out = serializeSCXML(doc);
    expect(out).toContain('sendid="x"');
    expect(out).toContain('sendidexpr="y()"');
  });
});

describe('targeted coverage: metadata without text', () => {
  it('serializes a self-closing metadata block', () => {
    const doc: SCXMLDocument = {
      scxml: {
        version: '1.0',
        states: [],
        parallels: [],
        finals: [],
        scripts: [],
        metadata: [{ tag: 'custom:tag', attributes: { id: 'n1' } }],
      },
    };
    const out = serializeSCXML(doc, { pretty: false });
    expect(out).toContain('<custom:tag id="n1" />');
  });
});

describe('targeted coverage: data with src/confType and text', () => {
  it('parses and serializes data elements with src and confType', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel>
          <data id="remote" src="./file.json" confType="json" />
        </datamodel>
        <state id="a" />
      </scxml>
    `;
    const { out, doc } = rt(xml);
    expect(doc.scxml.datamodelChildren?.[0].src).toBe('./file.json');
    expect(doc.scxml.datamodelChildren?.[0].confType).toBe('json');
    expect(out).toContain('src="./file.json"');
    expect(out).toContain('confType="json"');
  });

  it('serializes a data element with text content', () => {
    const doc: SCXMLDocument = {
      scxml: {
        version: '1.0',
        states: [],
        parallels: [],
        finals: [],
        scripts: [],
        metadata: [],
        datamodelChildren: [{ id: 'd', text: 'value' }],
      },
    };
    const out = serializeSCXML(doc, { pretty: false });
    expect(out).toContain('>value</data>');
  });
});

describe('targeted coverage: content element with both expr and text', () => {
  it('parses content that has both expression and text', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <final id="f"><donedata><content expr="e">inline</content></donedata></final>
      </scxml>
    `;
    const { out, doc } = rt(xml);
    expect(doc.scxml.finals[0].donedata?.content?.expr).toBe('e');
    expect(doc.scxml.finals[0].donedata?.content?.text).toBe('inline');
    expect(out).toContain('expr="e"');
  });
});

describe('targeted coverage: parsing metadata with text', () => {
  it('parses a metadata block with string text content', () => {
    const xml = `
      <scxml version="1.0" initial="a" xmlns:viz="http://example.com/viz">
        <viz:note viz:id="n1">note text</viz:note>
        <state id="a" />
      </scxml>
    `;
    const { doc } = rt(xml);
    const meta = doc.scxml.metadata?.find((m) => m.tag === 'viz:note');
    expect(meta).toBeDefined();
    expect(meta?.text).toBe('note text');
    expect(meta?.attributes['viz:id']).toBe('n1');
  });
});

describe('targeted coverage: validator initial block variants', () => {
  it('validates a manually-built AST with single transition initial block lacking a target', () => {
    const doc: SCXMLDocument = {
      scxml: {
        version: '1.0',
        states: [
          {
            id: 'a',
            initialBlock: { transition: [{ target: 'missing' }] },
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
      },
    };
    const diagnostics = validateAST(doc);
    expect(diagnostics.some((d) => d.code === 'ERR_INITIAL_STATE_NOT_FOUND')).toBe(true);
  });

  it('handles an initial block transition without a target', () => {
    const doc: SCXMLDocument = {
      scxml: {
        version: '1.0',
        states: [
          {
            id: 'a',
            initialBlock: { transition: [{ event: 'E' }] },
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
      },
    };
    expect(validateAST(doc)).toHaveLength(0);
  });
});

describe('targeted coverage: parallel state executable & datamodel content', () => {
  it('parses and serializes a parallel with onentry, onexit, datamodel, and an initial block', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <onentry><log label="p-in" /></onentry>
          <onexit><log label="p-out" /></onexit>
          <initial><transition target="p_a" /></initial>
          <datamodel><data id="pv" expr="1" /></datamodel>
          <state id="p_a" />
        </parallel>
      </scxml>
    `;
    const { out, doc } = rt(xml);
    const p = doc.scxml.parallels[0];
    expect(p.onentry).toHaveLength(1);
    expect(p.onexit).toHaveLength(1);
    expect(p.initialBlock).toBeDefined();
    expect(p.datamodel).toHaveLength(1);
    expect(out).toContain('<parallel id="p">');
    expect(out).toContain('label="p-in"');
    expect(out).toContain('id="pv"');
    expect(validateAST(doc)).toHaveLength(0);
  });

  it('parses and serializes a parallel that carries its own transition and a history', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <history id="p_hist" />
          <transition event="JOIN" target="p" />
          <state id="p_a" />
          <state id="p_b" />
        </parallel>
      </scxml>
    `;
    const { out, doc } = rt(xml);
    const p = doc.scxml.parallels[0];
    expect(p.transitions).toHaveLength(1);
    expect(p.history).toHaveLength(1);
    expect(out).toContain('event="JOIN"');
    expect(out).toContain('<history id="p_hist"');
    // Validating exercises the walker on a parallel with history.
    expect(validateAST(doc)).toHaveLength(0);
  });
});

describe('targeted coverage: empty-machine warning variants', () => {
  it('does not warn when only a parallel state exists', () => {
    const xml = `<scxml version="1.0"><parallel id="p"><state id="a" /></parallel></scxml>`;
    const r = parseSCXML(xml);
    expect(r.success).toBe(true);
    expect(r.errors.some((e) => e.code === 'WARN_EMPTY_STATE_MACHINE')).toBe(false);
  });

  it('does not warn when only a final state exists', () => {
    const xml = `<scxml version="1.0"><final id="done" /></scxml>`;
    const r = parseSCXML(xml);
    expect(r.success).toBe(true);
    expect(r.errors.some((e) => e.code === 'WARN_EMPTY_STATE_MACHINE')).toBe(false);
  });
});

describe('targeted coverage: executable content edge cases', () => {
  it('ignores unrecognized child tags inside a transition', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="X" target="a"><notExecutable /></transition>
        </state>
      </scxml>
    `;
    const { doc } = rt(xml);
    expect(doc.scxml.states[0].transitions[0].executable).toHaveLength(0);
  });

  it('parses script with src only (object form) inside onentry', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><onentry><script src="inline.js" /></onentry></state>
      </scxml>
    `;
    const { doc } = rt(xml);
    const s = doc.scxml.states[0].onentry?.[0];
    // Scripts have no `kind` discriminator; detect via shape.
    expect('src' in s).toBe(true);
    expect((s as { src?: string }).src).toBe('inline.js');
  });
});

describe('targeted coverage: metadata text variants', () => {
  it('parses numeric metadata text as a number', () => {
    const xml = `
      <scxml version="1.0" xmlns:viz="http://example.com/viz">
        <viz:note viz:id="n1">42</viz:note>
      </scxml>
    `;
    const { doc } = rt(xml);
    const meta = doc.scxml.metadata?.find((m) => m.tag === 'viz:note');
    expect(meta).toBeDefined();
    expect(meta?.text).toBe(42);
  });

  it('preserves a bare numeric metadata child as a number', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <metadata><count>5</count></metadata>
        </state>
      </scxml>
    `;
    const { doc } = rt(xml);
    const meta = doc.scxml.states[0].metadata.find((m) => m.tag === 'count');
    expect(meta?.text).toBe(5);
  });

  it('parses data elements carrying text alongside attributes', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel><data id="d" expr="x">inlined</data></datamodel>
        <state id="a" />
      </scxml>
    `;
    const { doc } = rt(xml);
    const d = doc.scxml.datamodelChildren?.[0];
    expect(d.expr).toBe('x');
    expect(d.text).toBe('inlined');
  });
});

describe('targeted coverage: deep state structure serialization', () => {
  it('serializes a compound state with initial, datamodel, history, and internal transitions', () => {
    const xml = `
      <scxml version="1.0" initial="root">
        <state id="root" initial="inner">
          <datamodel><data id="sd" expr="0" /></datamodel>
          <history id="h" />
          <transition type="internal" event="ping" />
          <transition event="GO" target="root">
            <log label="on-transition" expr="sd" />
          </transition>
          <state id="inner" />
        </state>
      </scxml>
    `;
    const { out, doc } = rt(xml);
    const s = doc.scxml.states[0];
    expect(s.initial).toBe('inner');
    expect(s.datamodel).toHaveLength(1);
    expect(s.history).toHaveLength(1);
    expect(out).toContain('type="internal"');
    expect(out).toContain('on-transition');
    expect(out).toContain('<datamodel>');
    expect(validateAST(doc)).toHaveLength(0);
  });
});

describe('targeted coverage: script with both src and text', () => {
  it('parses a root script that has a src and inline text', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <script src="ext.js">var inline = 1;</script>
        <state id="a" />
      </scxml>
    `;
    const { doc } = rt(xml);
    const script = doc.scxml.scripts?.[0];
    expect(script.src).toBe('ext.js');
    expect(script.text).toBe('var inline = 1;');
  });
});

describe('targeted coverage: empty datamodel', () => {
  it('handles a datamodel with no data children', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel />
        <state id="a" />
      </scxml>
    `;
    const { doc, out } = rt(xml);
    // An empty <datamodel/> normalizes to an absent datamodel children list.
    expect(doc.scxml.datamodelChildren).toBeUndefined();
    expect(doc.scxml.datamodel).toBeUndefined();
    expect(validateAST(doc)).toHaveLength(0);
    void out;
  });

  it('handles an open-close empty datamodel element', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel></datamodel>
        <state id="a" />
      </scxml>
    `;
    const { doc, out } = rt(xml);
    // An open/close empty datamodel carries no data children.
    expect(doc.scxml.datamodelChildren).toBeUndefined();
    expect(validateAST(doc)).toHaveLength(0);
    void out;
  });
});

describe('targeted coverage: metadata key discipline', () => {
  it('does not treat a raw #text descendant as metadata', () => {
    const xml = `
      <scxml version="1.0" xmlns:viz="http://example.com/viz">
        <viz:note viz:id="n1">some text</viz:note>
        <state id="a" />
      </scxml>
    `;
    const { doc } = rt(xml);
    const meta = doc.scxml.metadata?.filter((m) => m.tag === 'viz:note');
    expect(meta).toHaveLength(1);
    expect(meta[0].text).toBe('some text');
  });
});

describe('targeted coverage: missing optional attributes handled gracefully', () => {
  it('defaults missing state/parallel/final/history/data ids to empty strings', () => {
    const xml = `
      <scxml version="1.0">
        <state><parallel><final><history /></final></parallel></state>
        <datamodel><data /></datamodel>
      </scxml>
    `;
    const { doc } = rt(xml);
    const state = doc.scxml.states[0];
    const parallel = state.parallels[0];
    expect(state.id).toBe('');
    expect(parallel.id).toBe('');
    expect(parallel.finals[0].id).toBe('');
    expect(doc.scxml.datamodelChildren?.[0].id).toBe('');
  });

  it('defaults missing executable attributes to empty strings', () => {
    const xml = `
      <scxml version="1.0">
        <state>
          <onentry>
            <raise />
            <if><elseif /><else /></if>
            <foreach><assign /></foreach>
          </onentry>
        </state>
      </scxml>
    `;
    const { doc } = rt(xml);
    const entries = doc.scxml.states[0].onentry!;
    const raise = entries.find((e) => e.kind === 'raise');
    const ifBlock = entries.find((e) => e.kind === 'if');
    const foreach = entries.find((e) => e.kind === 'foreach');
    const assign = entries.find((e) => e.kind === 'assign');
    if (raise && raise.kind === 'raise') expect(raise.event).toBe('');
    if (ifBlock && ifBlock.kind === 'if') expect(ifBlock.cond).toBe('');
    if (foreach && foreach.kind === 'foreach') {
      expect(foreach.array).toBe('');
      expect(foreach.item).toBe('');
    }
    if (assign && assign.kind === 'assign') expect(assign.location).toBe('');
  });
});

describe('targeted coverage: empty-machine warning boundaries', () => {
  it('does not warn when only states exist (no name or initial)', () => {
    const r = parseSCXML(`<scxml version="1.0"><state id="a" /></scxml>`);
    expect(r.success).toBe(true);
    expect(r.errors.some((e) => e.code === 'WARN_EMPTY_STATE_MACHINE')).toBe(false);
  });
});

describe('targeted coverage: nested single initial block', () => {
  it('parses a single (non-array) nested initial block', () => {
    const xml = `
      <scxml version="1.0" initial="o">
        <state id="o">
          <initial><initial><transition target="i" /></initial></initial>
          <state id="i" />
        </state>
      </scxml>
    `;
    const { doc, out } = rt(xml);
    const block = doc.scxml.states[0].initialBlock!;
    expect(block.blocks).toBeDefined();
    expect(out).toContain('<initial>');
    expect(validateAST(doc)).toHaveLength(0);
  });
});

describe('targeted coverage: history without an id attribute', () => {
  it('defaults a history id to an empty string', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><history /></state>
      </scxml>
    `;
    const { doc, out } = rt(xml);
    expect(doc.scxml.states[0].history[0].id).toBe('');
    expect(out).toContain('<history id=""');
  });
});

describe('targeted coverage: param without a name attribute', () => {
  it('defaults an invoke param name to an empty string', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <invoke><param expr="1" /></invoke>
        </state>
      </scxml>
    `;
    const { doc, out } = rt(xml);
    expect(doc.scxml.states[0].invoke[0].param?.[0].name).toBe('');
    expect(out).toContain('name=""');
  });
});

describe('targeted coverage: serialization with escapeText disabled', () => {
  it('does not escape text or attribute values when escapeText is false', () => {
    const doc: SCXMLDocument = {
      scxml: {
        version: '1.0',
        states: [
          {
            id: 'a',
            transitions: [],
            states: [],
            parallels: [],
            finals: [],
            history: [],
            invoke: [],
            datamodel: [{ id: 'd', text: 'a < b & c' }],
            onentry: [{ kind: 'log', label: 'x < y', expr: 'a & b' }],
          },
        ],
        parallels: [],
        finals: [],
        scripts: [],
        metadata: [],
      },
    };
    const out = serializeSCXML(doc, { escapeText: false });
    expect(out).toContain('a < b & c');
    expect(out).toContain('label="x < y"');
  });
});
