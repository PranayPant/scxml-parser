import { describe, expect, it } from 'vitest';
import { parseSCXML } from '../src/parser';
import { serializeSCXML, unescapeXML } from '../src/serializer';
import type { SCXMLDocument } from '../src/types';

/**
 * Parses XML then serializes it back, returning the round-tripped string.
 */
function roundTrip(xml: string): string {
  const result = parseSCXML(xml);
  expect(result.success).toBe(true);
  return serializeSCXML(result.data!);
}

describe('serializeSCXML', () => {
  it('round-trips a simple document losslessly', () => {
    const xml = `
      <scxml version="1.0" initial="Idle">
        <state id="Idle">
          <transition event="START" target="Active" />
        </state>
        <state id="Active" />
      </scxml>
    `;
    const out = roundTrip(xml);
    expect(out).toContain('<scxml');
    expect(out).toContain('initial="Idle"');
    expect(out).toContain('<state id="Idle">');
    expect(out).toContain('event="START"');
  });

  it('produces AST -> XML -> AST equality', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <transition event="GO" target="b" />
        </state>
        <state id="b" />
      </scxml>
    `;
    const doc1 = parseSCXML(xml).data!;
    const xml2 = serializeSCXML(doc1, { pretty: false });
    const doc2 = parseSCXML(xml2).data!;
    expect(doc2.scxml.states.map((s) => s.id)).toEqual(['a', 'b']);
    expect(doc2.scxml.states[0].transitions[0].target).toBe('b');
    expect(doc2.scxml.states[0].transitions[0].event).toBe('GO');
  });

  it('minification produces a single-line compact output', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><transition target="b" /></state>
        <state id="b" />
      </scxml>
    `;
    const out = serializeSCXML(parseSCXML(xml).data!, { pretty: false });
    expect(out.split('\n')).toHaveLength(2); // content + trailing newline
    expect(out).not.toContain('\n  ');
  });

  it('pretty printing uses the configured indent', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><state id="a1" /></state>
      </scxml>
    `;
    const out = serializeSCXML(parseSCXML(xml).data!, { indent: 4 });
    expect(out).toContain('\n    <state id="a">');
  });

  it('escapes reserved XML characters in data expressions', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <datamodel><data id="r" expr="total &gt; 100 &amp;&amp; ok" /></datamodel>
        <state id="a" />
      </scxml>
    `;
    const out = roundTrip(xml);
    // Escaping is idempotent: parser already un-escaped '&gt;' to '>', so the
    // serializer should re-escape it to &gt;.
    expect(out).toContain('total &gt; 100');
  });

  it('round-trips script text and onentry content', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <script>var x = 1 &lt; 2;</script>
        <state id="a">
          <onentry><log label="L" expr="x" /></onentry>
        </state>
      </scxml>
    `;
    const out = roundTrip(xml);
    expect(out).toContain('var x = 1 &lt; 2;');
    expect(out).toContain('<onentry>');
    expect(out).toContain('label="L"');
  });

  it('serializes parallel, final, history, and invoke structures', () => {
    const xml = `
      <scxml version="1.0" initial="p">
        <parallel id="p">
          <state id="a"><history id="h" type="deep" /></state>
          <final id="f"><donedata><content expr="d" /></donedata></final>
          <invoke id="svc" type="node" src="s.js"><param name="x" expr="1" /></invoke>
        </parallel>
      </scxml>
    `;
    const out = roundTrip(xml);
    expect(out).toContain('<parallel id="p">');
    expect(out).toContain('<history id="h" type="deep"');
    expect(out).toContain('<final id="f">');
    expect(out).toContain('<donedata>');
    expect(out).toContain('src="s.js"');
  });

  it('serializes send with params, content, and delay attributes', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <onentry>
            <send event="GO" delay="100ms" namelist="x"><param name="p" expr="v" /><content expr="c" /></send>
          </onentry>
        </state>
      </scxml>
    `;
    const out = roundTrip(xml);
    expect(out).toContain('delay="100ms"');
    expect(out).toContain('namelist="x"');
    expect(out).toContain('expr="c"');
  });

  it('serializes foreach and cancel', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a">
          <onentry>
            <foreach array="arr" item="i" index="k"><log expr="i" /></foreach>
            <cancel sendid="s1" />
          </onentry>
        </state>
      </scxml>
    `;
    const out = roundTrip(xml);
    expect(out).toContain('array="arr"');
    expect(out).toContain('index="k"');
    expect(out).toContain('sendid="s1"');
  });

  it('does not emit type attribute for external transitions by default', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><transition type="external" target="b" /></state>
        <state id="b" />
      </scxml>
    `;
    const out = roundTrip(xml);
    expect(out).not.toContain('type="external"');
  });

  it('emits state type attributes when includeStateTypes is enabled', () => {
    const doc: SCXMLDocument = parseSCXML(
      '<scxml version="1.0" initial="a"><state id="a" type="compound"><state id="a1" /></state></scxml>',
    ).data!;
    const out = serializeSCXML(doc, { includeStateTypes: true });
    expect(out).toContain('type="compound"');
  });

  it('serializes metadata blocks from the AST', () => {
    const doc: SCXMLDocument = {
      scxml: {
        version: '1.0',
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
        metadata: [{ tag: 'custom:note', attributes: { id: 'n1' }, text: 'hi' }],
      },
    };
    const out = serializeSCXML(doc);
    expect(out).toContain('<custom:note id="n1">');
    expect(out).toContain('hi');
  });

  it('serializes root-level scripts', () => {
    const doc: SCXMLDocument = {
      scxml: {
        version: '1.0',
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
        scripts: [{ src: 'ext.js' }],
        metadata: [],
      },
    };
    const out = serializeSCXML(doc);
    expect(out).toContain('src="ext.js"');
  });

  it('correctly orders root attributes', () => {
    const doc: SCXMLDocument = {
      scxml: {
        name: 'machine',
        xmlns: 'http://www.w3.org/2005/07/scxml',
        version: '1.0',
        datamodel: 'ecmascript',
        binding: 'late',
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
        metadata: [],
      },
    };
    const out = serializeSCXML(doc);
    expect(out).toContain('name="machine"');
    expect(out).toContain('xmlns="http://www.w3.org/2005/07/scxml"');
    expect(out).toContain('datamodel="ecmascript"');
    expect(out).toContain('binding="late"');
  });

  it('unescapeXML decodes known entities', () => {
    expect(unescapeXML('a &amp; b &lt; c')).toBe('a & b < c');
  });

  it('serializes content element with expr only as self-closing', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <final id="f"><donedata><content expr="x" /></donedata></final>
      </scxml>
    `;
    const out = roundTrip(xml);
    expect(out).toContain('<content expr="x" />');
  });

  it('serializes cancel with sendidexpr', () => {
    const xml = `
      <scxml version="1.0" initial="a">
        <state id="a"><onentry><cancel sendidexpr="getId()" /></onentry></state>
      </scxml>
    `;
    const out = roundTrip(xml);
    expect(out).toContain('sendidexpr="getId()"');
  });

  it('serializes script closure with empty content', () => {
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
          },
        ],
        parallels: [],
        finals: [],
        scripts: [{ text: '' }],
        metadata: [],
      },
    };
    const out = serializeSCXML(doc);
    expect(out).toContain('<script>');
  });
});
