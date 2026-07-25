import { describe, it, expect } from 'vitest';
import { measureLabelWidth } from './measure-label-width';

describe('measureLabelWidth', () => {
  // jsdom implements the DOM but not real CSS layout, so every size read
  // (scrollWidth, offsetWidth, getBoundingClientRect) comes back 0
  // regardless of content — this is the exact "no real layout engine"
  // case the function is documented to return null for, which is what
  // lets node-dimension-calculator fall back to its estimate under test.
  it('returns null under jsdom (no real layout engine)', () => {
    expect(measureLabelWidth('a_reasonably_long_state_name')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(measureLabelWidth('')).toBeNull();
  });
});
