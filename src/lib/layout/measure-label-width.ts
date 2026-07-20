/**
 * Real rendered width of a state node's label text, measured via a hidden
 * off-screen DOM element — same technique as the sticky-note component's
 * text measurer (use-note-sizing.ts) — rather than guessing from character
 * count. A fixed px-per-character estimate is never accurate for a
 * proportional font, and the error compounds with string length: it was
 * consistently too narrow for long labels, causing visible text overflow.
 *
 * Font is 18px/700 (matches the label's `text-lg font-bold` classes in
 * scxml-state-node.tsx) — kept in sync manually since there's no shared
 * source of truth between Tailwind classes and this measurer. Font
 * *family* is deliberately left unset here so the element inherits it from
 * `<body>` via normal CSS cascade, matching the real label exactly without
 * hardcoding the app's font stack a second time.
 */

const LABEL_FONT_SIZE_PX = 18; // text-lg
const LABEL_FONT_WEIGHT = '700'; // font-bold

let measurer: HTMLSpanElement | null = null;

function getMeasurer(): HTMLSpanElement {
  if (!measurer || !measurer.isConnected) {
    measurer = document.createElement('span');
    const style = measurer.style;
    style.position = 'absolute';
    style.top = '-9999px';
    style.left = '-9999px';
    style.visibility = 'hidden';
    style.pointerEvents = 'none';
    style.whiteSpace = 'pre';
    style.fontSize = `${LABEL_FONT_SIZE_PX}px`;
    style.fontWeight = LABEL_FONT_WEIGHT;
    document.body.appendChild(measurer);
  }
  return measurer;
}

/**
 * Returns the real rendered width (px) of `text` at the label's font, or
 * `null` when no real layout engine is available to measure with — no
 * `document` at all (SSR, the plain-Node dimension-calculator test), or a
 * suspiciously-zero result (jsdom: it implements the DOM but not actual
 * CSS layout, so every size read — scrollWidth, offsetWidth,
 * getBoundingClientRect — comes back 0 regardless of content). Callers
 * should fall back to an estimate in either case.
 */
export function measureLabelWidth(text: string): number | null {
  if (typeof document === 'undefined' || !text) return null;

  try {
    const el = getMeasurer();
    el.textContent = text;
    const width = el.scrollWidth;
    return width > 0 ? width : null;
  } catch {
    return null;
  }
}
