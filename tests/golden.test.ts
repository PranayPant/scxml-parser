/**
 * Golden / snapshot tests for the parser output.
 *
 * The `examples/scxml/*.scxml` corpus is the canonical example set. These
 * tests pin the parser's AST output as checked-in golden snapshots so that:
 *
 *  1. Round-trip stability is enforced against a *real* corpus (not just
 *     inline test strings).
 *  2. Any silent AST-shape drift (naming, node-kind conventions, null fields)
 *     — the cross-language wire contract the orchestrator/server consume —
 *     is caught at commit time rather than at runtime.
 *
 * First run writes the snapshots with `-u`; afterwards they are committed and
 * any parser change that alters the emitted AST fails CI.
 */
import { describe, expect, it } from 'vitest';
import { parseSCXML, serializeSCXML } from '../src/index';
import { exampleName, listExamples, readExample } from './fixtures';

describe('golden AST snapshots (examples/scxml corpus)', () => {
  const examples = listExamples();

  it('loads the example corpus', () => {
    // Guards against the corpus silently shrinking / the loader breaking.
    expect(examples.length).toBeGreaterThan(0);
    expect(examples.map(exampleName)).toEqual([
      'auth-login',
      'cart-checkout',
      'reservation',
      'traffic-light',
    ]);
  });

  for (const file of examples) {
    const name = exampleName(file);

    describe(name, () => {
      const xml = readExample(name);

      it('parses successfully with no error diagnostics', () => {
        const res = parseSCXML(xml);
        expect(res.success).toBe(true);
        expect(res.data).toBeDefined();
        // Example corpus must be authored cleanly (warnings are fine, errors are not).
        expect(res.errors.filter((d) => d.severity === 'error')).toEqual([]);
      });

      it('matches the golden AST snapshot', () => {
        const res = parseSCXML(xml);
        expect(res.data).toMatchSnapshot();
      });

      it('round-trips losslessly through serialize -> parse', () => {
        const res = parseSCXML(xml);
        const xmlOut = serializeSCXML(res.data!);
        const res2 = parseSCXML(xmlOut);
        expect(res2.success).toBe(true);
        expect(res2.data).toEqual(res.data);
      });
    });
  }
});
