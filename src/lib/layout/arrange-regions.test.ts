import { describe, it, expect } from 'vitest';
import { arrangeRegions } from './arrange-regions';

const region = (id: string, width = 160, height = 80) => ({ id, width, height });

describe('arrangeRegions', () => {
  it('sizes 2 regions to their content width (160px), not stretched to fill the wrapper', () => {
    const result = arrangeRegions([region('a'), region('b')]);

    expect(result.regionBoxes).toEqual([
      { id: 'a', x: 16, y: 48, width: 160, height: 80 },
      { id: 'b', x: 192, y: 48, width: 160, height: 80 },
    ]);
    expect(result.wrapperWidth).toBe(368);
    expect(result.wrapperHeight).toBe(144);
  });

  it('sizes 3 regions to their content width in a single row', () => {
    const result = arrangeRegions([region('a'), region('b'), region('c')]);

    expect(result.regionBoxes.map((b) => b.width)).toEqual([160, 160, 160]);
    expect(result.wrapperWidth).toBe(544);
    expect(result.wrapperHeight).toBe(144);
  });

  it('wraps 5 regions onto a second row once a row at content width would exceed the max wrapper width', () => {
    const result = arrangeRegions([
      region('a'), region('b'), region('c'), region('d'), region('e'),
    ]);

    expect(result.regionBoxes[0]).toEqual({ id: 'a', x: 16, y: 48, width: 160, height: 80 });
    expect(result.regionBoxes[3]).toEqual({ id: 'd', x: 544, y: 48, width: 160, height: 80 });
    expect(result.regionBoxes[4]).toEqual({ id: 'e', x: 16, y: 144, width: 160, height: 80 });
    expect(result.wrapperWidth).toBe(720);
    expect(result.wrapperHeight).toBe(240);
  });

  it('uses a wider column when a region actually needs more space (e.g. a long label)', () => {
    const result = arrangeRegions([region('a', 300, 80), region('b', 160, 80)]);

    expect(result.regionBoxes[0].width).toBe(300);
    expect(result.regionBoxes[1].width).toBe(300);
    expect(result.wrapperWidth).toBe(648);
  });

  it('is N-agnostic: no hardcoded branch per region count', () => {
    const twoRegionColumnWidth = arrangeRegions([region('a'), region('b')]).regionBoxes[0].width;
    const sevenRegions = arrangeRegions(
      Array.from({ length: 7 }, (_, i) => region(`r${i}`))
    );

    expect(sevenRegions.regionBoxes).toHaveLength(7);
    expect(sevenRegions.regionBoxes.every((b) => b.width >= 160)).toBe(true);
    expect(twoRegionColumnWidth).toBe(160);
  });

  it('returns a minimum-sized empty wrapper for zero regions', () => {
    const result = arrangeRegions([]);

    expect(result.regionBoxes).toEqual([]);
    expect(result.wrapperWidth).toBe(192);
    expect(result.wrapperHeight).toBe(144);
  });

  it('sizes each row to the tallest region in the whole set', () => {
    const result = arrangeRegions([region('a', 160, 80), region('b', 160, 140)]);

    expect(result.regionBoxes[0].height).toBe(140);
    expect(result.regionBoxes[1].height).toBe(140);
  });
});
