import { describe, it, expect } from 'vitest';
import { ELKLayoutService } from './elk-layout-service';

function makeChain(length: number) {
  const nodes = Array.from({ length }, (_, i) => ({ id: `s${i}` }));
  const edges = Array.from({ length: length - 1 }, (_, i) => ({
    source: `s${i}`,
    target: `s${i + 1}`,
  }));
  return { nodes, edges };
}

describe('ELKLayoutService wrapping option', () => {
  it('stacks a long linear chain into a single column when wrapping is not requested', async () => {
    const service = new ELKLayoutService();
    const { nodes, edges } = makeChain(12);

    const positions = await service.computeSimpleLayout(nodes, edges, {
      direction: 'DOWN',
      aspectRatio: 3,
    });

    const xs = new Set(Array.from(positions.values()).map((p) => Math.round(p.x)));
    expect(xs.size).toBe(1);
  });

  it('folds a long linear chain into multiple columns when wrapping is enabled', async () => {
    const service = new ELKLayoutService();
    const { nodes, edges } = makeChain(12);

    const positions = await service.computeSimpleLayout(nodes, edges, {
      direction: 'DOWN',
      aspectRatio: 3,
      wrapping: true,
    });

    const xs = new Set(Array.from(positions.values()).map((p) => Math.round(p.x)));
    expect(xs.size).toBeGreaterThan(1);
  });

  it('widens the row-to-row gap via nodeNodeBetweenLayers without changing column spacing', async () => {
    const service = new ELKLayoutService();
    const { nodes, edges } = makeChain(9);

    const rowGap = (positions: Map<string, { x: number; y: number }>) => {
      const ys = Array.from(new Set(Array.from(positions.values()).map((p) => Math.round(p.y)))).sort(
        (a, b) => a - b
      );
      return ys[1] - ys[0];
    };
    const columnXs = (positions: Map<string, { x: number; y: number }>) =>
      Array.from(new Set(Array.from(positions.values()).map((p) => Math.round(p.x)))).sort((a, b) => a - b);

    const tight = await service.computeSimpleLayout(nodes, edges, {
      direction: 'DOWN',
      aspectRatio: 3,
      wrapping: true,
      spacing: { nodeNode: 40 },
    });
    const wide = await service.computeSimpleLayout(nodes, edges, {
      direction: 'DOWN',
      aspectRatio: 3,
      wrapping: true,
      spacing: { nodeNode: 40, nodeNodeBetweenLayers: 100 },
    });

    expect(rowGap(wide)).toBeGreaterThan(rowGap(tight));
    expect(columnXs(wide)).toEqual(columnXs(tight));
  });
});
