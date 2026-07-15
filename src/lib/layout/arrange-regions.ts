/**
 * Arranges a <parallel> state's direct regions as equal-width columns inside
 * its wrapper, sized to the regions' own content width (not stretched to
 * fill available space), wrapping to additional rows once a row of columns
 * at that width would exceed MAX_WRAPPER_WIDTH. N-agnostic: the same formula
 * handles 1 region or 20.
 */

export interface RegionInput {
  id: string;
  width: number;
  height: number;
}

export interface RegionBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionsArrangement {
  regionBoxes: RegionBox[];
  wrapperWidth: number;
  wrapperHeight: number;
}

const MIN_COLUMN_WIDTH = 160;
const MAX_WRAPPER_WIDTH = 720;
const GAP = 16;
const PADDING = 16;
const HEADER_HEIGHT = 32;
const MIN_ROW_HEIGHT = 80;

export function arrangeRegions(regions: RegionInput[]): RegionsArrangement {
  if (regions.length === 0) {
    return {
      regionBoxes: [],
      wrapperWidth: PADDING * 2 + MIN_COLUMN_WIDTH,
      wrapperHeight: HEADER_HEIGHT + PADDING * 2 + MIN_ROW_HEIGHT,
    };
  }

  const columnWidth = Math.max(MIN_COLUMN_WIDTH, ...regions.map((r) => r.width));

  const maxColumnsThatFit = Math.max(
    1,
    Math.floor((MAX_WRAPPER_WIDTH - PADDING * 2 + GAP) / (columnWidth + GAP))
  );
  const columns = Math.max(1, Math.min(regions.length, maxColumnsThatFit));
  const rows = Math.ceil(regions.length / columns);
  const rowHeight = Math.max(MIN_ROW_HEIGHT, ...regions.map((r) => r.height));

  const regionBoxes: RegionBox[] = regions.map((region, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    return {
      id: region.id,
      x: PADDING + col * (columnWidth + GAP),
      y: HEADER_HEIGHT + PADDING + row * (rowHeight + GAP),
      width: columnWidth,
      height: rowHeight,
    };
  });

  const wrapperWidth = PADDING * 2 + columns * columnWidth + (columns - 1) * GAP;
  const wrapperHeight =
    HEADER_HEIGHT + PADDING * 2 + rows * rowHeight + (rows - 1) * GAP;

  return { regionBoxes, wrapperWidth, wrapperHeight };
}
