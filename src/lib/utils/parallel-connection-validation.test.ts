import { describe, it, expect } from 'vitest';
import type { Node } from 'reactflow';
import {
  isSameParallelSiblingConnection,
  isDisconnectedParallelJump,
} from './parallel-connection-validation';

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

describe('isDisconnectedParallelJump', () => {
  const nodes: Node[] = [
    node('parallel_1', 'parallel'),
    node('region_1', 'simple', 'parallel_1'),
    node('region_2', 'simple', 'parallel_1'),
    node('parallel_2', 'parallel'),
    node('region_3', 'simple', 'parallel_2'),
    node('region_4', 'simple', 'parallel_2'),
    node('outer', 'parallel'),
    node('outer_region_1', 'simple', 'outer'),
    node('inner', 'parallel', 'outer'),
    node('inner_region_1', 'simple', 'inner'),
    node('idle', 'simple'),
    node('done', 'final'),
  ];

  it('rejects a connection directly between two unrelated parallel wrappers', () => {
    expect(isDisconnectedParallelJump('parallel_1', 'parallel_2', nodes)).toBe(true);
  });

  it('rejects a connection from a region of one parallel into a region of another', () => {
    expect(isDisconnectedParallelJump('region_1', 'region_3', nodes)).toBe(true);
  });

  it('allows a nested parallel targeting its own enclosing (ancestor) parallel', () => {
    expect(isDisconnectedParallelJump('inner_region_1', 'outer', nodes)).toBe(false);
  });

  it('allows a plain state transitioning into a parallel wrapper', () => {
    expect(isDisconnectedParallelJump('idle', 'parallel_1', nodes)).toBe(false);
  });

  it('allows a parallel wrapper transitioning out to a plain external state', () => {
    expect(isDisconnectedParallelJump('parallel_1', 'done', nodes)).toBe(false);
  });

  it('returns false for a self-loop', () => {
    expect(isDisconnectedParallelJump('parallel_1', 'parallel_1', nodes)).toBe(false);
  });

  it('returns false when either node is missing', () => {
    expect(isDisconnectedParallelJump('parallel_1', 'nonexistent', nodes)).toBe(false);
  });
});
