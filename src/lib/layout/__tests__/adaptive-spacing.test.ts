/**
 * Tests for computeAdaptiveSpacing — scales ELK's node-node (and, via the
 * shared spacing value, between-layer) spacing up when a level contains a
 * degree outlier, so hub nodes and their many neighbors get more room to
 * separate visually. No test runner configured; run directly:
 *
 *   npx tsx src/lib/layout/__tests__/adaptive-spacing.test.ts
 */
import assert from 'node:assert/strict';
import { computeAdaptiveSpacing } from '../adaptive-spacing';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

test('returns baseSpacing when no node exceeds the baseline degree', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
  const edges = [
    { source: 'A', target: 'B' },
    { source: 'B', target: 'C' },
    { source: 'C', target: 'D' },
  ]; // max degree here is 2 (B and C), at the default baseline
  assert.equal(computeAdaptiveSpacing(nodes, edges), 40);
});

test('increases spacing proportionally to how far the busiest node exceeds baseline degree', () => {
  const nodes = [
    { id: 'A' }, { id: 'B' }, { id: 'C' },
    { id: 'D' }, { id: 'E' }, { id: 'HUB' },
  ];
  const edges = [
    { source: 'HUB', target: 'A' },
    { source: 'HUB', target: 'B' },
    { source: 'HUB', target: 'C' },
    { source: 'HUB', target: 'D' },
    { source: 'HUB', target: 'E' },
  ]; // HUB degree 5, baseline 2 -> 40 + 15*(5-2) = 85
  assert.equal(computeAdaptiveSpacing(nodes, edges), 85);
});

test('self-loops do not inflate degree or spacing', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'HUB' }];
  const edges = [
    { source: 'HUB', target: 'A' },
    { source: 'HUB', target: 'B' },
    { source: 'HUB', target: 'C' },
    { source: 'HUB', target: 'HUB' }, // must not count
  ]; // degree 3, baseline 2 -> 40 + 15*(3-2) = 55
  assert.equal(computeAdaptiveSpacing(nodes, edges), 55);
});

test('edges referencing ids outside the given node set are ignored', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'HUB' }];
  const edges = [
    { source: 'HUB', target: 'A' },
    { source: 'HUB', target: 'B' },
    { source: 'HUB', target: 'OUTSIDE' },
    { source: 'OUTSIDE2', target: 'HUB' },
  ]; // only A, B count -> degree 2, at baseline -> no extra
  assert.equal(computeAdaptiveSpacing(nodes, edges), 40);
});

test('custom options are respected', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'HUB' }];
  const edges = [
    { source: 'HUB', target: 'A' },
    { source: 'HUB', target: 'B' },
    { source: 'HUB', target: 'C' },
  ]; // degree 3
  const spacing = computeAdaptiveSpacing(nodes, edges, {
    baseSpacing: 60,
    perNeighborExtra: 10,
    baselineDegree: 1,
  });
  assert.equal(spacing, 60 + 10 * (3 - 1)); // 80
});

test('never returns less than baseSpacing, even with no edges at all', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }];
  assert.equal(computeAdaptiveSpacing(nodes, []), 40);
});

console.log(`\n${passed} tests passed`);
