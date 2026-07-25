/**
 * Tests for edge-obstacle-utils — pure geometry helpers for obstacle-aware
 * edge routing. No test runner is configured in this project; run directly:
 *
 *   npx tsx src/lib/layout/__tests__/edge-obstacle-utils.test.ts
 */
import assert from 'node:assert/strict';
import {
  getHandleAnchor,
  segmentIntersectsRect,
  approximateOrthogonalRoute,
  countRouteCrossings,
  routeIntersectsAnyRect,
  simplifyOrthogonalGridPath,
  type Rect,
} from '../edge-obstacle-utils';
import { buildRoundedOrthogonalPath, buildSelfLoopPath } from '../path-builders';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

// ---------- getHandleAnchor ----------

const rect: Rect = { x: 0, y: 0, width: 100, height: 50 };

test('getHandleAnchor: bottom is midpoint of bottom side', () => {
  assert.deepEqual(getHandleAnchor(rect, 'bottom'), { x: 50, y: 50 });
});

test('getHandleAnchor: top is midpoint of top side', () => {
  assert.deepEqual(getHandleAnchor(rect, 'top'), { x: 50, y: 0 });
});

test('getHandleAnchor: right is midpoint of right side', () => {
  assert.deepEqual(getHandleAnchor(rect, 'right'), { x: 100, y: 25 });
});

test('getHandleAnchor: left is midpoint of left side', () => {
  assert.deepEqual(getHandleAnchor(rect, 'left'), { x: 0, y: 25 });
});

// ---------- segmentIntersectsRect ----------

const box: Rect = { x: 100, y: 100, width: 100, height: 100 };

test('segmentIntersectsRect: horizontal segment through box', () => {
  assert.equal(
    segmentIntersectsRect({ x: 0, y: 150 }, { x: 300, y: 150 }, box),
    true
  );
});

test('segmentIntersectsRect: vertical segment through box', () => {
  assert.equal(
    segmentIntersectsRect({ x: 150, y: 0 }, { x: 150, y: 300 }, box),
    true
  );
});

test('segmentIntersectsRect: segment missing box entirely', () => {
  assert.equal(
    segmentIntersectsRect({ x: 0, y: 50 }, { x: 300, y: 50 }, box),
    false
  );
});

test('segmentIntersectsRect: segment grazing the top border does not count', () => {
  assert.equal(
    segmentIntersectsRect({ x: 0, y: 100 }, { x: 300, y: 100 }, box),
    false
  );
});

test('segmentIntersectsRect: diagonal segment crossing a corner region', () => {
  assert.equal(
    segmentIntersectsRect({ x: 50, y: 120 }, { x: 120, y: 50 }, box),
    false
  );
  assert.equal(
    segmentIntersectsRect({ x: 50, y: 50 }, { x: 250, y: 250 }, box),
    true
  );
});

test('segmentIntersectsRect: segment fully inside box', () => {
  assert.equal(
    segmentIntersectsRect({ x: 120, y: 120 }, { x: 180, y: 180 }, box),
    true
  );
});

// ---------- approximateOrthogonalRoute ----------

test('approximateOrthogonalRoute: facing right→left routes via mid-x', () => {
  const route = approximateOrthogonalRoute(
    { x: 100, y: 25 },
    'right',
    { x: 300, y: 125 },
    'left'
  );
  assert.deepEqual(route, [
    { x: 100, y: 25 },
    { x: 200, y: 25 },
    { x: 200, y: 125 },
    { x: 300, y: 125 },
  ]);
});

test('approximateOrthogonalRoute: facing bottom→top routes via mid-y', () => {
  const route = approximateOrthogonalRoute(
    { x: 50, y: 50 },
    'bottom',
    { x: 150, y: 250 },
    'top'
  );
  assert.deepEqual(route, [
    { x: 50, y: 50 },
    { x: 50, y: 150 },
    { x: 150, y: 150 },
    { x: 150, y: 250 },
  ]);
});

test('approximateOrthogonalRoute: same-side bottom↔bottom loops below both anchors', () => {
  const route = approximateOrthogonalRoute(
    { x: 50, y: 50 },
    'bottom',
    { x: 250, y: 100 },
    'bottom',
    40
  );
  assert.deepEqual(route, [
    { x: 50, y: 50 },
    { x: 50, y: 140 },
    { x: 250, y: 140 },
    { x: 250, y: 100 },
  ]);
});

test('approximateOrthogonalRoute: same-side left↔left loops left of both anchors', () => {
  const route = approximateOrthogonalRoute(
    { x: 100, y: 50 },
    'left',
    { x: 80, y: 200 },
    'left',
    40
  );
  assert.deepEqual(route, [
    { x: 100, y: 50 },
    { x: 40, y: 50 },
    { x: 40, y: 200 },
    { x: 80, y: 200 },
  ]);
});

test('approximateOrthogonalRoute: perpendicular right→top uses single corner', () => {
  const route = approximateOrthogonalRoute(
    { x: 100, y: 25 },
    'right',
    { x: 250, y: 100 },
    'top'
  );
  assert.deepEqual(route, [
    { x: 100, y: 25 },
    { x: 250, y: 25 },
    { x: 250, y: 100 },
  ]);
});

test('approximateOrthogonalRoute: perpendicular top→right uses single corner', () => {
  const route = approximateOrthogonalRoute(
    { x: 100, y: 50 },
    'top',
    { x: 250, y: 20 },
    'right'
  );
  assert.deepEqual(route, [
    { x: 100, y: 50 },
    { x: 100, y: 20 },
    { x: 250, y: 20 },
  ]);
});

// ---------- countRouteCrossings ----------

test('countRouteCrossings: rect crossed by two segments counts once', () => {
  // U-shaped route where both vertical legs pierce the same wide rect
  const route = [
    { x: 0, y: 0 },
    { x: 0, y: 200 },
    { x: 300, y: 200 },
    { x: 300, y: 0 },
  ];
  const wide: Rect = { x: -50, y: 80, width: 400, height: 40 };
  assert.equal(countRouteCrossings(route, [wide]), 1);
});

test('countRouteCrossings: counts each distinct rect crossed', () => {
  const route = [
    { x: 0, y: 150 },
    { x: 500, y: 150 },
  ];
  const a: Rect = { x: 100, y: 100, width: 100, height: 100 };
  const b: Rect = { x: 300, y: 100, width: 100, height: 100 };
  const clear: Rect = { x: 100, y: 300, width: 100, height: 100 };
  assert.equal(countRouteCrossings(route, [a, b, clear]), 2);
});

test('routeIntersectsAnyRect: true when any rect is crossed, false otherwise', () => {
  const route = [
    { x: 0, y: 150 },
    { x: 500, y: 150 },
  ];
  const a: Rect = { x: 100, y: 100, width: 100, height: 100 };
  const clear: Rect = { x: 100, y: 300, width: 100, height: 100 };
  assert.equal(routeIntersectsAnyRect(route, [a]), true);
  assert.equal(routeIntersectsAnyRect(route, [clear]), false);
});

// ---------- simplifyOrthogonalGridPath ----------

const allWalkable = () => true;

test('simplifyOrthogonalGridPath: staircase in open space collapses to one L', () => {
  const staircase = [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
    [2, 2],
    [3, 2],
    [3, 3],
  ];
  assert.deepEqual(simplifyOrthogonalGridPath(staircase, allWalkable), [
    [0, 0],
    [3, 0],
    [3, 3],
  ]);
});

test('simplifyOrthogonalGridPath: straight run collapses to endpoints', () => {
  const straight = [
    [0, 0],
    [0, 1],
    [0, 2],
  ];
  assert.deepEqual(simplifyOrthogonalGridPath(straight, allWalkable), [
    [0, 0],
    [0, 2],
  ]);
});

test('simplifyOrthogonalGridPath: blocked L falls back to the other corner', () => {
  // Cells (2,0) and (3,0) blocked: horizontal-first corner at (3,0) is not
  // reachable, vertical-first via (0,3) is.
  const blocked = new Set(['2,0', '3,0']);
  const isWalkable = (x: number, y: number) => !blocked.has(`${x},${y}`);
  const staircase = [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
    [2, 2],
    [3, 2],
    [3, 3],
  ];
  assert.deepEqual(simplifyOrthogonalGridPath(staircase, isWalkable), [
    [0, 0],
    [0, 3],
    [3, 3],
  ]);
});

test('simplifyOrthogonalGridPath: detour around an obstacle is preserved', () => {
  // U-shaped walk around blocked cells (1,0) and (1,1)
  const blocked = new Set(['1,0', '1,1']);
  const isWalkable = (x: number, y: number) => !blocked.has(`${x},${y}`);
  const uPath = [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [2, 1],
    [2, 0],
  ];
  const result = simplifyOrthogonalGridPath(uPath, isWalkable);
  assert.deepEqual(result, [
    [0, 0],
    [0, 2],
    [2, 2],
    [2, 0],
  ]);
});

// ---------- buildRoundedOrthogonalPath ----------

test('buildRoundedOrthogonalPath: collinear grid walk collapses to one segment', () => {
  const d = buildRoundedOrthogonalPath(
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    [
      [0, 0],
      [0, 50],
    ]
  );
  assert.equal(d, 'M 0,0 L 0,100');
});

test('buildRoundedOrthogonalPath: L-shape gets a rounded corner', () => {
  const d = buildRoundedOrthogonalPath(
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    [
      [0, 0],
      [50, 0],
      [100, 0],
      [100, 50],
    ],
    8
  );
  assert.equal(d, 'M 0,0 L 92,0 Q 100,0 100,8 L 100,100');
});

test('buildRoundedOrthogonalPath: diagonal hop from source gets an elbow that merges with the next segment', () => {
  // Source is off-grid by (10, 7); the following grid segment is horizontal,
  // so the elbow should arrive on that horizontal line and merge with it.
  const d = buildRoundedOrthogonalPath(
    { x: 0, y: 3 },
    { x: 50, y: 50 },
    [
      [10, 10],
      [50, 10],
    ],
    8
  );
  assert.equal(d, 'M 0,3 L 0,6.5 Q 0,10 3.5,10 L 42,10 Q 50,10 50,18 L 50,50');
});

test('buildRoundedOrthogonalPath: diagonal hop into target continues along the incoming axis', () => {
  const d = buildRoundedOrthogonalPath(
    { x: 0, y: 0 },
    { x: 48, y: 18 },
    [
      [0, 10],
      [40, 10],
    ],
    8
  );
  assert.equal(d, 'M 0,0 L 0,5 Q 0,10 5,10 L 44,10 Q 48,10 48,14 L 48,18');
});

test('buildRoundedOrthogonalPath: corner radius clamps to half the shorter leg', () => {
  const d = buildRoundedOrthogonalPath(
    { x: 0, y: 0 },
    { x: 6, y: 100 },
    [
      [0, 0],
      [6, 0],
      [6, 100],
    ],
    8
  );
  // horizontal leg is 6 long → radius clamps to 3
  assert.equal(d, 'M 0,0 L 3,0 Q 6,0 6,3 L 6,100');
});

// ---------- buildSelfLoopPath ----------

test('buildSelfLoopPath: bulges outside the node bounds to the right', () => {
  // Node spans x:100-200, y:100-200. Bottom-center source (150,200),
  // top-center target (150,100).
  const [path, labelX, labelY] = buildSelfLoopPath(
    150, 200,
    150, 100,
    100, 100, 100, 100,
    40,
    8
  );
  const outX = 100 + 100 + 40; // nodeX + nodeWidth + bulge = 240
  assert.equal(labelX, outX);
  assert.equal(labelY, 150); // midpoint of the outer vertical run (220↔80)
  assert.ok(path.includes(String(outX)), 'path should route out past the node edge');
  assert.ok(path.startsWith('M 150,200'));
});

test('buildSelfLoopPath: stub clamps to a floor for very short nodes', () => {
  // node height only 8px -> naive (sourceY-targetY)/4 = 2, clamped up to a floor of 8
  const [path] = buildSelfLoopPath(150, 108, 150, 100, 100, 100, 100, 8, 40, 8);
  // p1 = (150, 108+8=116), p4 = (150, 100-8=92) -- both become rounded-corner
  // control points, so their literal coordinates still appear in the path.
  assert.ok(path.includes('150,116'), 'source-side stub should clamp to the floor');
  assert.ok(path.includes('150,92'), 'target-side stub should clamp to the floor');
});

console.log(`\n${passed} tests passed`);
