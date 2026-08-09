import { describe, expect, it } from 'vitest';
import { parseSCXML, SCXMLEngine, type ScxmlStringRange } from '../src/index';

const xml = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <datamodel><data id="x" expr="1" /></datamodel>
  <state id="a">
    <transition event="GO" target="b" />
    <state id="a1" />
  </state>
  <state id="b">
    <initial><transition target="a" /></initial>
    <history id="h" type="deep"><transition target="a" /></history>
  </state>
  <parallel id="p">
    <state id="p1" />
  </parallel>
  <final id="f" />
</scxml>
`;

/** Returns the source substring covered by a range. */
function sliceAt(xml: string, range: ScxmlStringRange): string {
  return xml.slice(range.start.offset, range.end.offset);
}

describe('scxmlStringRange (opt-in captureStringPositions)', () => {
  it('is absent by default (captureStringPositions off)', () => {
    const ast = parseSCXML(xml).data!;
    expect(ast.scxml.scxmlStringRange).toBeUndefined();
    expect(ast.scxml.states[0].scxmlStringRange).toBeUndefined();
    expect(ast.scxml.states[0].transitions[0].scxmlStringRange).toBeUndefined();
  });

  it('captures a range for the scxml root', () => {
    const ast = parseSCXML(xml, { captureStringPositions: true }).data!;
    const r = ast.scxml.scxmlStringRange!;
    expect(sliceAt(xml, r)).toBe('<scxml version="1.0" initial="a">');
    expect(r.start.line).toBe(2);
    expect(r.start.column).toBe(1);
  });

  it('captures ranges for states and transitions', () => {
    const ast = parseSCXML(xml, { captureStringPositions: true }).data!;
    const a = ast.scxml.states[0];
    expect(sliceAt(xml, a.scxmlStringRange!)).toBe('<state id="a">');
    expect(sliceAt(xml, a.transitions[0].scxmlStringRange!)).toBe(
      '<transition event="GO" target="b" />',
    );
    expect(sliceAt(xml, a.states[0].scxmlStringRange!)).toBe('<state id="a1" />');
  });

  it('captures ranges for initial blocks and their transitions', () => {
    const ast = parseSCXML(xml, { captureStringPositions: true }).data!;
    const b = ast.scxml.states[1];
    expect(sliceAt(xml, b.initialBlock!.scxmlStringRange!)).toBe('<initial>');
    expect(sliceAt(xml, b.initialBlock!.transition![0].scxmlStringRange!)).toBe(
      '<transition target="a" />',
    );
  });

  it('captures ranges for history nodes and their default transitions', () => {
    const ast = parseSCXML(xml, { captureStringPositions: true }).data!;
    const b = ast.scxml.states[1];
    const h = b.history[0];
    expect(sliceAt(xml, h.scxmlStringRange!)).toBe('<history id="h" type="deep">');
    expect(sliceAt(xml, h.transition!.scxmlStringRange!)).toBe('<transition target="a" />');
  });

  it('captures ranges for parallel and final nodes', () => {
    const ast = parseSCXML(xml, { captureStringPositions: true }).data!;
    const p = ast.scxml.parallels[0];
    expect(sliceAt(xml, p.scxmlStringRange!)).toBe('<parallel id="p">');
    expect(sliceAt(xml, p.states[0].scxmlStringRange!)).toBe('<state id="p1" />');
    const f = ast.scxml.finals[0];
    expect(sliceAt(xml, f.scxmlStringRange!)).toBe('<final id="f" />');
  });

  it('correctly disambiguates multiple transitions between the same states', () => {
    const two = `<?xml version="1.0"?>
<scxml version="1.0" initial="a">
  <state id="a">
    <transition event="E1" target="b" />
    <transition event="E2" target="b" />
  </state>
  <state id="b" />
</scxml>
`;
    const ast = parseSCXML(two, { captureStringPositions: true }).data!;
    const transitions = ast.scxml.states[0].transitions;
    expect(sliceAt(two, transitions[0].scxmlStringRange!)).toBe(
      '<transition event="E1" target="b" />',
    );
    expect(sliceAt(two, transitions[1].scxmlStringRange!)).toBe(
      '<transition event="E2" target="b" />',
    );
  });

  it('is reachable through the SCXMLEngine.parse facade', () => {
    const ast = SCXMLEngine.parse(xml, { captureStringPositions: true }).data!;
    expect(ast.scxml.states[0].scxmlStringRange).toBeDefined();
    // And through SCXMLEngine.parse without options it stays off.
    const plain = SCXMLEngine.parse(xml).data!;
    expect(plain.scxml.states[0].scxmlStringRange).toBeUndefined();
  });

  it('keeps ranges aligned when the source contains comments, PIs, CDATA, and a DOCTYPE', () => {
    const noisy = `<!-- leading comment -->
<?render-target html?>
<!DOCTYPE scxml>
<scxml version="1.0" initial="a">
  <!-- a state -->
  <state id="a">
    <transition event="GO" target="b"><![CDATA[ <= not parsed ]]></transition>
  </state>
  <state id="b" />
</scxml>
`;
    const ast = parseSCXML(noisy, { captureStringPositions: true }).data!;
    const a = ast.scxml.states[0];
    expect(sliceAt(noisy, a.scxmlStringRange!)).toBe('<state id="a">');
    expect(sliceAt(noisy, a.transitions[0].scxmlStringRange!)).toBe(
      '<transition event="GO" target="b">',
    );
  });

  it('does not throw when captureStringPositions runs on malformed input', () => {
    // These inputs have `captureStringPositions` on, so the scanner runs
    // before validation reaches an error. It must not throw on malformed /
    // truncated input.
    const malformed = [
      '',
      '<scxml>',
      '<scxml><',
      '<scxml><state',
      '<?xml',
      '<!-- unterminated comment',
      '<![CDATA[unterminated',
      '<!DOCTYPE scxml',
      '</scxml',
      '<scxml version=unterminated',
    ];
    for (const bad of malformed) {
      expect(() => parseSCXML(bad, { captureStringPositions: true })).not.toThrow();
    }
  });
});
