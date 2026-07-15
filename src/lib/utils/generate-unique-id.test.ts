import { describe, it, expect } from 'vitest';
import { generateUniqueId } from './generate-unique-id';

describe('generateUniqueId', () => {
  it('returns "<prefix>_1" when nothing with that prefix exists yet', () => {
    expect(generateUniqueId('region', [])).toBe('region_1');
  });

  it('skips ids that already exist', () => {
    expect(generateUniqueId('region', ['region_1', 'region_2'])).toBe('region_3');
  });

  it('fills the first gap rather than only ever appending', () => {
    expect(generateUniqueId('region', ['region_1', 'region_3'])).toBe('region_2');
  });
});
