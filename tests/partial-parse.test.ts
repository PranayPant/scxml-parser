import { describe, expect, it } from 'vitest';
import { parseSCXML, parseSCXMLPartial, SCXMLEngine, validateAST } from '../src/index';

describe('parseSCXMLPartial (best-effort parse)', () => {
  it('is exported as a function', () => {
    expect(typeof parseSCXMLPartial).toBe('function');
  });

  it('returns a full document with recoverable:true for well-formed input', () => {
    const xml = `<scxml version="1.0" initial="a"><state id="a" /><state id="b" /></scxml>`;
    const result = parseSCXMLPartial(xml);
    expect(result.recoverable).toBe(true);
    expect(result.data.scxml.states).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('always returns a data tree even for empty/malformed input', () => {
    const cases = ['', '   ', '<scxml>', '<scxml><state', 'not xml at all'];
    for (const bad of cases) {
      const result = parseSCXMLPartial(bad);
      // data is always defined:
      expect(result.data).toBeDefined();
      expect(result.data.scxml).toBeDefined();
      // and the strict parser would have rejected these:
      expect(parseSCXML(bad).data).toBeUndefined();
    }
  });

  it('marks recoverable:false when falling back on an empty document', () => {
    const result = parseSCXMLPartial('');
    expect(result.data.scxml.states).toEqual([]);
    expect(result.recoverable).toBe(false);
    expect(result.errors.some((d) => d.code === 'ERR_XML_SYNTAX')).toBe(true);
  });

  it("keeps strict parseSCXML's contract unchanged (data undefined on error)", () => {
    const result = parseSCXML('<scxml><state');
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('is reachable through the SCXMLEngine.parsePartial facade', () => {
    const ok = SCXMLEngine.parsePartial(
      '<scxml version="1.0" initial="a"><state id="a" /></scxml>',
    );
    expect(ok.recoverable).toBe(true);
    const fallback = SCXMLEngine.parsePartial('<scxml><state');
    expect(fallback.data.scxml).toBeDefined();
    expect(fallback.recoverable).toBe(false);
  });
});

describe('validator: nodeId / transitionId enrichment', () => {
  it('attaches transitionId to invalid-transition-target diagnostics', () => {
    const xml = `<scxml version="1.0" initial="a">
      <state id="a"><transition event="GO" target="missing" /></state>
    </scxml>`;
    const doc = parseSCXML(xml).data!;
    const diags = validateAST(doc);
    const target = diags.find((d) => d.code === 'ERR_INVALID_TRANSITION_TARGET');
    expect(target).toBeDefined();
    expect(target!.transitionId).toBe('a:missing');
    expect(target!.nodeId).toBe('a');
  });

  it('attaches nodeId to duplicate-state-id diagnostics', () => {
    const xml = `<scxml version="1.0">
      <state id="dup" /><state id="dup" />
    </scxml>`;
    const doc = parseSCXML(xml).data!;
    const dup = validateAST(doc).find((d) => d.code === 'ERR_DUPLICATE_STATE_ID');
    expect(dup).toBeDefined();
    expect(dup!.nodeId).toBe('dup');
  });

  it('attaches transitionId to invalid-event-name diagnostics', () => {
    const xml = `<scxml version="1.0" initial="a">
      <state id="a"><transition event="1bad" target="b" /></state>
      <state id="b" />
    </scxml>`;
    const doc = parseSCXML(xml).data!;
    const ev = validateAST(doc).find((d) => d.code === 'ERR_INVALID_EVENT_NAME');
    expect(ev).toBeDefined();
    expect(ev!.transitionId).toBe('a:b');
  });

  it('leaves nodeId/transitionId absent on XML syntax diagnostics', () => {
    const result = parseSCXML('<scxml><state');
    // Strict parse errors are syntax-level and carry no node/transition ids.
    for (const d of result.errors) {
      expect(d.nodeId).toBeUndefined();
      expect(d.transitionId).toBeUndefined();
    }
  });
});
