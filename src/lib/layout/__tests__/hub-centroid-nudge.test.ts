/**
 * Tests for computeHubCentroidNudges — pure post-ELK positioning helper.
 * No test runner configured; run directly:
 *
 *   npx tsx src/lib/layout/__tests__/hub-centroid-nudge.test.ts
 */
import assert from 'node:assert/strict';
import { computeHubCentroidNudges } from '../hub-centroid-nudge';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

test('nudges a clear hub to the horizontal centroid of its neighbors, y unchanged', () => {
  const nodes = [
    { id: 'A', x: 0, y: 500, width: 100, height: 50 },
    { id: 'B', x: 300, y: 500, width: 100, height: 50 },
    { id: 'C', x: 600, y: 500, width: 100, height: 50 },
    { id: 'D', x: 900, y: 500, width: 100, height: 50 },
    { id: 'HUB', x: 1200, y: 700, width: 100, height: 50 },
  ];
  const edges = [
    { source: 'HUB', target: 'A' },
    { source: 'HUB', target: 'B' },
    { source: 'HUB', target: 'C' },
    { source: 'HUB', target: 'D' },
  ];
  const nudges = computeHubCentroidNudges(nodes, edges);

  // centers: A=50, B=350, C=650, D=950 -> avg = 500 -> hub.x = 500 - 50 = 450
  assert.deepEqual(nudges.get('HUB'), { x: 450, y: 700 });
  assert.equal(nudges.has('A'), false);
  assert.equal(nudges.has('B'), false);
  assert.equal(nudges.has('C'), false);
  assert.equal(nudges.has('D'), false);
});

test('does not nudge anything when no node is a clear degree outlier', () => {
  const nodes = [
    { id: 'A', x: 0, y: 0, width: 100, height: 50 },
    { id: 'B', x: 200, y: 0, width: 100, height: 50 },
    { id: 'C', x: 400, y: 0, width: 100, height: 50 },
    { id: 'D', x: 600, y: 0, width: 100, height: 50 },
  ];
  // simple chain: every node has degree <= 2
  const edges = [
    { source: 'A', target: 'B' },
    { source: 'B', target: 'C' },
    { source: 'C', target: 'D' },
  ];
  const nudges = computeHubCentroidNudges(nodes, edges);
  assert.equal(nudges.size, 0);
});

test('self-loops do not count toward degree or contribute to the centroid', () => {
  const nodes = [
    { id: 'A', x: 0, y: 0, width: 100, height: 50 },
    { id: 'B', x: 300, y: 0, width: 100, height: 50 },
    { id: 'C', x: 600, y: 0, width: 100, height: 50 },
    { id: 'HUB', x: 1000, y: 200, width: 100, height: 50 },
  ];
  const edges = [
    { source: 'HUB', target: 'A' },
    { source: 'HUB', target: 'B' },
    { source: 'HUB', target: 'C' },
    { source: 'HUB', target: 'HUB' }, // self-loop, must not affect degree/centroid
  ];
  const nudges = computeHubCentroidNudges(nodes, edges);

  // centers: A=50, B=350, C=650 -> avg = 350 -> hub.x = 350-50 = 300
  assert.deepEqual(nudges.get('HUB'), { x: 300, y: 200 });
});

test('edges with an endpoint outside the given node set are ignored', () => {
  const nodes = [
    { id: 'A', x: 0, y: 0, width: 100, height: 50 },
    { id: 'B', x: 300, y: 0, width: 100, height: 50 },
    { id: 'C', x: 600, y: 0, width: 100, height: 50 },
    { id: 'HUB', x: 900, y: 200, width: 100, height: 50 },
  ];
  const edges = [
    { source: 'HUB', target: 'A' },
    { source: 'HUB', target: 'B' },
    { source: 'HUB', target: 'C' },
    { source: 'HUB', target: 'OUTSIDE' }, // OUTSIDE not in node set
    { source: 'OUTSIDE2', target: 'HUB' },
  ];
  const nudges = computeHubCentroidNudges(nodes, edges);

  // Only A, B, C count -> centers 50,350,650 -> avg 350 -> hub.x = 300
  assert.deepEqual(nudges.get('HUB'), { x: 300, y: 200 });
});

test('multiple independent hubs are each nudged to their own neighbor centroid', () => {
  const nodes = [
    { id: 'A1', x: 0, y: 0, width: 100, height: 50 },
    { id: 'A2', x: 200, y: 0, width: 100, height: 50 },
    { id: 'A3', x: 400, y: 0, width: 100, height: 50 },
    { id: 'HUB1', x: 900, y: 100, width: 100, height: 50 },
    { id: 'B1', x: 1000, y: 300, width: 100, height: 50 },
    { id: 'B2', x: 1200, y: 300, width: 100, height: 50 },
    { id: 'B3', x: 1400, y: 300, width: 100, height: 50 },
    { id: 'HUB2', x: 2000, y: 400, width: 100, height: 50 },
  ];
  const edges = [
    { source: 'HUB1', target: 'A1' },
    { source: 'HUB1', target: 'A2' },
    { source: 'HUB1', target: 'A3' },
    { source: 'HUB2', target: 'B1' },
    { source: 'HUB2', target: 'B2' },
    { source: 'HUB2', target: 'B3' },
  ];
  const nudges = computeHubCentroidNudges(nodes, edges);

  // HUB1 centers: 50,250,450 -> avg 250 -> x = 200
  assert.deepEqual(nudges.get('HUB1'), { x: 200, y: 100 });
  // HUB2 centers: 1050,1250,1450 -> avg 1250 -> x = 1200
  assert.deepEqual(nudges.get('HUB2'), { x: 1200, y: 400 });
  assert.equal(nudges.size, 2);
});

test('a degree exactly at the threshold boundary is nudged (inclusive)', () => {
  // 4 leaves at degree 1, hub at degree 4 -> avg = (1*4+4)/5 = 1.6,
  // default outlierMultiplier=2 -> threshold = max(3, 3.2) = 3.2, 4 >= 3.2 => nudged
  const nodes = [
    { id: 'A', x: 0, y: 0, width: 100, height: 50 },
    { id: 'B', x: 200, y: 0, width: 100, height: 50 },
    { id: 'C', x: 400, y: 0, width: 100, height: 50 },
    { id: 'D', x: 600, y: 0, width: 100, height: 50 },
    { id: 'HUB', x: 5000, y: 0, width: 100, height: 50 },
  ];
  const edges = [
    { source: 'HUB', target: 'A' },
    { source: 'HUB', target: 'B' },
    { source: 'HUB', target: 'C' },
    { source: 'HUB', target: 'D' },
  ];
  const nudges = computeHubCentroidNudges(nodes, edges);
  assert.ok(nudges.has('HUB'));
});

test('custom minDegree/outlierMultiplier options are respected', () => {
  // 3 leaves at degree 1 each connected to a degree-3 node: avg=(1*3+3)/4=1.5,
  // default threshold = max(3, 3.0) = 3 -> 3 >= 3 nudged by default...
  const nodes = [
    { id: 'A', x: 0, y: 0, width: 100, height: 50 },
    { id: 'B', x: 200, y: 0, width: 100, height: 50 },
    { id: 'C', x: 400, y: 0, width: 100, height: 50 },
    { id: 'HUB', x: 5000, y: 0, width: 100, height: 50 },
  ];
  const edges = [
    { source: 'HUB', target: 'A' },
    { source: 'HUB', target: 'B' },
    { source: 'HUB', target: 'C' },
  ];
  // raise minDegree above 3 so this no longer qualifies
  const nudges = computeHubCentroidNudges(nodes, edges, { minDegree: 5 });
  assert.equal(nudges.size, 0);
});

test('nudge keeps at least the default gap from another node sitting at the ideal centroid spot', () => {
  // Same hub/spokes as the first test (ideal centroid x = 450), but there is
  // also an unrelated OBSTACLE node already sitting exactly where that
  // centroid would land, sharing HUB's row (y=700). The nudge must not
  // relocate HUB flush against it — it should stop minGap short of the
  // nearest clear edge instead, even though that means landing further from
  // the true centroid.
  const nodes = [
    { id: 'A', x: 0, y: 500, width: 100, height: 50 },
    { id: 'B', x: 300, y: 500, width: 100, height: 50 },
    { id: 'C', x: 600, y: 500, width: 100, height: 50 },
    { id: 'D', x: 900, y: 500, width: 100, height: 50 },
    { id: 'HUB', x: 1200, y: 700, width: 100, height: 50 },
    { id: 'OBSTACLE', x: 430, y: 700, width: 100, height: 50 },
  ];
  const edges = [
    { source: 'HUB', target: 'A' },
    { source: 'HUB', target: 'B' },
    { source: 'HUB', target: 'C' },
    { source: 'HUB', target: 'D' },
  ];
  const nudges = computeHubCentroidNudges(nodes, edges);

  const hubNudge = nudges.get('HUB')!;
  assert.ok(hubNudge, 'HUB should still be nudged');
  // rightOf = 530 + 40 = 570 is closer to the ideal 450 than leftOf = 290
  assert.deepEqual(hubNudge, { x: 570, y: 700 });

  const gap = hubNudge.x - (430 + 100);
  assert.ok(gap >= 40, `expected at least a 40px gap, got ${gap}`);
});

test('a custom minGap widens the clearance kept from a row obstacle', () => {
  const nodes = [
    { id: 'A', x: 0, y: 500, width: 100, height: 50 },
    { id: 'B', x: 300, y: 500, width: 100, height: 50 },
    { id: 'C', x: 600, y: 500, width: 100, height: 50 },
    { id: 'D', x: 900, y: 500, width: 100, height: 50 },
    { id: 'HUB', x: 1200, y: 700, width: 100, height: 50 },
    { id: 'OBSTACLE', x: 430, y: 700, width: 100, height: 50 },
  ];
  const edges = [
    { source: 'HUB', target: 'A' },
    { source: 'HUB', target: 'B' },
    { source: 'HUB', target: 'C' },
    { source: 'HUB', target: 'D' },
  ];
  const nudges = computeHubCentroidNudges(nodes, edges, { minGap: 100 });

  const hubNudge = nudges.get('HUB')!;
  assert.deepEqual(hubNudge, { x: 630, y: 700 });
});

console.log(`\n${passed} tests passed`);
