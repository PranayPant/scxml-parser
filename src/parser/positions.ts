/**
 * Source-range capture for AST nodes.
 *
 * An opt-in pass that records, for each SCXML element in the raw source
 * string, the exact `ScxmlStringRange` (start/end `Position`) it was parsed
 * from. The scanner is invoked only when `parseSCXML` is called with
 * `captureStringPositions: true`, so the default pipeline pays no cost.
 *
 * Ranges are keyed by a deterministic element path (e.g.
 * `scxml/state/0/transition/1`) that mirrors how the normalizers traverse
 * the tree, so each normalizer can look up its node's span while building.
 *
 * Ranges are a snapshot of the exact string passed to `parseSCXML`: they are
 * never serialized and become stale once the AST is serialized or mutated.
 */
import type { Position, ScxmlStringRange } from '../types/ast';

/** A map from a normalized element path (e.g. `scxml/state/0/transition/1`) to its source range. */
export type RangeMap = Map<string, ScxmlStringRange>;

/**
 * Walks `xml` (which must already be valid XML) and records the source span
 * of every element, keyed by its document path. Comments, processing
 * instructions, CDATA, and DOCTYPE blocks are skipped so they don't disrupt
 * the element walk.
 *
 * @param xml - The raw, valid SCXML string.
 * @returns A map of element path -> source range.
 */
export function scanElementRanges(xml: string): RangeMap {
  const ranges: RangeMap = new Map();
  const positions = new PositionIndex(xml);
  const stack: Array<{
    path: string;
    tagName: string;
    siblings: Map<string, number>;
  }> = [];
  let cursor = 0;
  const n = xml.length;

  while (cursor < n) {
    const lt = xml.indexOf('<', cursor);
    if (lt === -1) {
      break;
    }

    if (xml.startsWith('<?', lt)) {
      const gt = xml.indexOf('?>', lt);
      if (gt === -1) break;
      cursor = gt + 2;
      continue;
    }
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt);
      if (end === -1) break;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt);
      if (end === -1) break;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<!', lt)) {
      const gt = findClosingBracket(xml, lt);
      if (gt === -1) break;
      cursor = gt + 1;
      continue;
    }
    if (xml.startsWith('</', lt)) {
      const gt = findClosingBracket(xml, lt);
      if (gt === -1) break;
      stack.pop();
      cursor = gt + 1;
      continue;
    }

    // Start tag (possibly self-closing).
    const gt = findClosingBracket(xml, lt);
    if (gt === -1) break;
    const tagName = readName(xml, lt + 1);
    if (!tagName) break;
    const selfClosing = xml[gt - 1] === '/';

    const parent = stack.length > 0 ? stack[stack.length - 1] : null;
    const parentPath = parent ? parent.path : '';
    const path = parentPath ? `${parentPath}/${tagName}` : tagName;

    // Build the indexed sibling count for this element.
    const siblings = parent ? parent.siblings : new Map<string, number>();
    const idx = siblings.get(tagName) ?? 0;
    // A <transition> directly under a <history> is a single child (the
    // normalized `HistoryNode.transition` is a bare `Transition`, not an
    // array). The root element is unindexed. Every other element is indexed
    // by sibling position.
    const isSingleChild =
      parent !== null && parent.tagName === 'history' && tagName === 'transition';
    const isRoot = parent === null;
    const elementPath = isSingleChild || isRoot ? path : `${path}/${idx}`;

    ranges.set(elementPath, {
      start: positions.positionAt(lt),
      end: positions.positionAt(gt + 1),
    });

    // Reserve this sibling slot (self-closing elements still consume a slot).
    siblings.set(tagName, idx + 1);
    if (!selfClosing) {
      // Children derive their paths from this element's *indexed* path.
      stack.push({ path: elementPath, tagName, siblings: new Map() });
    }
    cursor = gt + 1;
  }

  return ranges;
}

/**
 * Finds the '>' that ends the tag starting at `start` (index of '<'),
 * honoring quoted attribute values so '>' inside a quoted value doesn't
 * terminate the tag early.
 */
function findClosingBracket(xml: string, start: number): number {
  let i = start;
  let quote: string | null = null;
  while (i < xml.length) {
    const ch = xml[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
    i++;
  }
  return -1;
}

/** Reads the tag/attribute name starting at `start`. */
function readName(xml: string, start: number): string {
  const m = /[A-Za-z_][A-Za-z0-9_.:-]*/.exec(xml.slice(start, start + 80));
  return m ? m[0] : '';
}

/**
 * Converts an absolute character offset into a `Position` (line/col/offset)
 * using a precomputed line-start index. Line/column are 1-based.
 */
class PositionIndex {
  private readonly lineStarts: number[];

  constructor(source: string) {
    this.lineStarts = [0];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\n') {
        this.lineStarts.push(i + 1);
      }
    }
  }

  positionAt(offset: number): Position {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return {
      line: lo + 1,
      column: offset - this.lineStarts[lo] + 1,
      offset,
    };
  }
}
