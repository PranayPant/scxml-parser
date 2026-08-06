import { describe, expect, it } from 'vitest';
import { parseSCXML, printAST, SCXMLEngine, serializeSCXML, validateAST } from '../src/index';

/**
 * A maximally feature-rich SCXML document exercising deep nesting across
 * state, parallel, final, history, invoke, datamodel, and every executable
 * element. Used to drive high path coverage across the recursive helpers.
 */
const KITCHEN_SINK = `
<scxml version="1.0" datamodel="ecmascript" initial="root" name="KitchenSink"
       xmlns="http://www.w3.org/2005/07/scxml">
  <script>window.init = function(){ return 1; };</script>
  <datamodel>
    <data id="count" expr="0" />
    <data id="name">default</data>
  </datamodel>
  <state id="root">
    <onentry>
      <raise event="START" />
      <log label="enter" expr="'hi'" />
      <assign location="count" expr="count + 1" />
      <if cond="count > 0">
        <log label="positive" />
        <elseif cond="count < 0"><log label="negative" /></elseif>
        <else><log label="zero" /></else>
      </if>
      <foreach array="items" item="i" index="idx"><log expr="i" /></foreach>
      <send event="GO" delay="100ms"><param name="p" expr="1" /></send>
      <cancel sendid="s1" />
      <script>var z = 1;</script>
    </onentry>
    <onexit><log label="exit" /></onexit>
    <transition event="NEXT" cond="count > 1" target="p1" />
    <transition target="done" />
    <state id="root_inner">
      <history id="root_hist" type="deep" />
      <state id="leaf1" />
      <parallel id="inner_par">
        <state id="lp1"><state id="lp1_a" /></state>
        <final id="inner_final"><donedata><content expr="x" /></donedata></final>
      </parallel>
      <final id="inner_done" />
      <invoke id="svc" type="node" src="srv.js" autoforward="true">
        <param name="x" expr="1" />
        <finalize><log label="fin" /></finalize>
        <content expr="ctx" />
      </invoke>
    </state>
  </state>
  <parallel id="p1">
    <onentry><log label="p1-in" /></onentry>
    <state id="p1_a">
      <transition event="back" target="root" />
    </state>
    <state id="p1_b"><history id="p1_h" /></state>
    <parallel id="p1_inner">
      <state id="p1_i_a" />
      <state id="p1_i_b" />
    </parallel>
    <final id="p1_done" />
  </parallel>
  <final id="done" />
</scxml>
`;

describe('integration: full pipeline on a feature-rich document', () => {
  it('parses the kitchen-sink document successfully', () => {
    const result = parseSCXML(KITCHEN_SINK);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates the kitchen-sink document with no diagnostics', () => {
    const doc = parseSCXML(KITCHEN_SINK).data!;
    const diagnostics = validateAST(doc);
    expect(diagnostics).toHaveLength(0);
  });

  it('serializes and re-parses the kitchen-sink document losslessly', () => {
    const doc = parseSCXML(KITCHEN_SINK).data!;
    const xml = serializeSCXML(doc, { pretty: true });
    const doc2 = parseSCXML(xml).data!;
    // Spot-check structural fidelity through deep nesting.
    expect(doc2.scxml.parallels).toHaveLength(1);
    expect(doc2.scxml.states[0].states[0].parallels[0].states).toHaveLength(1);
    expect(validateAST(doc2)).toHaveLength(0);
  });

  it('minified serialization still round-trips', () => {
    const doc = parseSCXML(KITCHEN_SINK).data!;
    const xml = serializeSCXML(doc, { pretty: false });
    const doc2 = parseSCXML(xml).data!;
    expect(doc2.scxml.states[0].states[0].history[0].type).toBe('deep');
    // The invoke lives on the root_inner state (root.states[0].states[0]).
    expect(doc2.scxml.states[0].states[0].invoke[0]).toBeDefined();
    // The parallel sits alongside it.
    expect(doc2.scxml.states[0].states[0].parallels[0].id).toBe('inner_par');
  });

  it('prints the kitchen-sink document', () => {
    const doc = parseSCXML(KITCHEN_SINK).data!;
    const out = printAST(doc);
    expect(out).toContain('SCXML Root');
    expect(out).toContain('Parallel("p1")');
    expect(out).toContain('History("root_hist") [deep]');
  });

  it('supports the SCXMLEngine facade end-to-end', () => {
    const result = SCXMLEngine.parse(KITCHEN_SINK);
    expect(result.success).toBe(true);
    const doc = result.data!;
    expect(SCXMLEngine.validate(doc)).toHaveLength(0);
    expect(SCXMLEngine.serialize(doc)).toContain('<scxml');
    expect(SCXMLEngine.print(doc)).toContain('SCXML Root');
  });
});
