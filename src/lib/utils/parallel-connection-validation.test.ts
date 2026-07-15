import { describe, it, expect } from 'vitest';
import type { Node } from 'reactflow';
import { isSameParallelSiblingConnection } from './parallel-connection-validation';

const node = (id: string, stateType: string, parentId?: string): Node => ({
  id,
  type: 'scxmlState',
  position: { x: 0, y: 0 },
  parentId,
  data: { label: id, stateType },
});

describe('isSameParallelSiblingConnection', () => {
  const nodes: Node[] = [
    node('running', 'parallel'),
    node('motor_region', 'simple', 'running'),
    node('sensor_region', 'simple', 'running'),
    node('outer', 'compound'),
    node('outer_child_a', 'simple', 'outer'),
    node('outer_child_b', 'simple', 'outer'),
    node('done', 'final'),
  ];

  it('rejects a connection between two sibling regions of the same parallel', () => {
    expect(
      isSameParallelSiblingConnection('motor_region', 'sensor_region', nodes)
    ).toBe(true);
  });

  it('allows a connection between two children of an ordinary (non-parallel) compound state', () => {
    expect(
      isSameParallelSiblingConnection('outer_child_a', 'outer_child_b', nodes)
    ).toBe(false);
  });

  it('allows a connection from a region to something outside its parallel', () => {
    expect(
      isSameParallelSiblingConnection('motor_region', 'done', nodes)
    ).toBe(false);
  });

  it('allows a connection from outside into a region', () => {
    expect(
      isSameParallelSiblingConnection('done', 'motor_region', nodes)
    ).toBe(false);
  });

  it('returns false for a self-loop (not a sibling-region case)', () => {
    expect(
      isSameParallelSiblingConnection('motor_region', 'motor_region', nodes)
    ).toBe(false);
  });

  it('returns false when either node is missing', () => {
    expect(
      isSameParallelSiblingConnection('motor_region', 'nonexistent', nodes)
    ).toBe(false);
  });
});
