import { describe, it, expect } from 'vitest';
import { shouldWrapLevel, DEFAULT_WRAP_THRESHOLD } from './chain-wrapping';

describe('shouldWrapLevel', () => {
  it('does not wrap when node count is at the default threshold', () => {
    expect(shouldWrapLevel(DEFAULT_WRAP_THRESHOLD)).toBe(false);
  });

  it('does not wrap when node count is below the default threshold', () => {
    expect(shouldWrapLevel(3)).toBe(false);
  });

  it('wraps once node count exceeds the default threshold', () => {
    expect(shouldWrapLevel(DEFAULT_WRAP_THRESHOLD + 1)).toBe(true);
  });

  it('respects a custom threshold', () => {
    expect(shouldWrapLevel(5, 4)).toBe(true);
    expect(shouldWrapLevel(4, 4)).toBe(false);
  });
});
