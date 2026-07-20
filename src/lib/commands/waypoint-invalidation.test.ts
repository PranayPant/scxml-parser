import { describe, it, expect } from 'vitest';
import { clearWaypointsForTouchingTransitions, restoreClearedWaypoints } from './waypoint-invalidation';

const VIZ_HEADER =
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

function serialize(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

describe('clearWaypointsForTouchingTransitions', () => {
  it('clears waypoints on an outgoing transition from the given state', () => {
    const doc = parse(
      `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`
    );
    clearWaypointsForTouchingTransitions(doc, 'A');
    expect(serialize(doc)).not.toContain('viz:waypoints');
  });

  it('clears waypoints on an incoming transition from a sibling', () => {
    const doc = parse(
      `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`
    );
    clearWaypointsForTouchingTransitions(doc, 'B');
    expect(serialize(doc)).not.toContain('viz:waypoints');
  });

  it('leaves transitions untouched when they neither source nor target the given state', () => {
    const doc = parse(
      `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1"/></state><state id="B"><transition target="C" viz:waypoints="2,2"/></state><state id="C"/></scxml>`
    );
    clearWaypointsForTouchingTransitions(doc, 'A');
    expect(serialize(doc)).toContain('viz:waypoints="2,2"');
    expect(serialize(doc)).not.toContain('viz:waypoints="1,1"');
  });

  it('returns an empty snapshot when nothing had waypoints', () => {
    const doc = parse(`${VIZ_HEADER}><state id="A"><transition target="B"/></state><state id="B"/></scxml>`);
    const cleared = clearWaypointsForTouchingTransitions(doc, 'A');
    expect(cleared).toEqual([]);
  });

  it('returns a snapshot describing what was cleared', () => {
    const doc = parse(
      `${VIZ_HEADER}><state id="A"><transition event="go" target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`
    );
    const cleared = clearWaypointsForTouchingTransitions(doc, 'A');
    expect(cleared).toEqual([
      { sourceId: 'A', targetId: 'B', event: 'go', cond: null, previousWaypoints: '1,1;2,2' },
    ]);
  });
});

describe('restoreClearedWaypoints', () => {
  it('re-applies a cleared snapshot to the matching transition', () => {
    const doc = parse(
      `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`
    );
    const cleared = clearWaypointsForTouchingTransitions(doc, 'A');
    expect(serialize(doc)).not.toContain('viz:waypoints');

    restoreClearedWaypoints(doc, cleared);
    expect(serialize(doc)).toContain('viz:waypoints="1,1;2,2"');
  });

  it('matches by event and cond so it does not restore onto the wrong transition', () => {
    const doc = parse(
      `${VIZ_HEADER}><state id="A"><transition event="go" target="B" viz:waypoints="1,1"/><transition event="stop" target="B" viz:waypoints="2,2"/></state><state id="B"/></scxml>`
    );
    const cleared = clearWaypointsForTouchingTransitions(doc, 'A');
    restoreClearedWaypoints(doc, cleared);
    const serialized = serialize(doc);
    expect(serialized).toContain('viz:waypoints="1,1"');
    expect(serialized).toContain('viz:waypoints="2,2"');
  });
});
