/**
 * Tests for mergeConfigEntries — combines host-pushed IO.conf override values
 * with any in-progress local edits, applied over the current SCXML's conf_
 * fields. No test runner configured; run directly:
 *
 *   npx tsx src/lib/utils/__tests__/config-overrides.test.ts
 */
import assert from 'node:assert/strict';
import { mergeConfigEntries, type OverrideEntry } from '../config-overrides';
import type { ConfigField } from '../datamodel-extractor';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

function field(name: string, defaultValue = '0'): ConfigField {
  return { name, type: 'int', defaultValue };
}

test('returns an empty array when there are no fields', () => {
  const result = mergeConfigEntries([field('a')].slice(0, 0), [{ name: 'a', override: '5' }], []);
  assert.deepEqual(result, []);
});

test('uses the host override when there is no local edit', () => {
  const result = mergeConfigEntries([field('threshold')], [{ name: 'threshold', override: '42' }], []);
  assert.deepEqual(result, [{ field: field('threshold'), override: '42' }]);
});

test('defaults to a blank override when the field has no host override and no local edit', () => {
  const result = mergeConfigEntries([field('threshold')], [], []);
  assert.deepEqual(result, [{ field: field('threshold'), override: '' }]);
});

test('an in-progress local edit takes precedence over the host override', () => {
  const previous: OverrideEntry[] = [{ field: field('threshold'), override: '99' }];
  const result = mergeConfigEntries([field('threshold')], [{ name: 'threshold', override: '42' }], previous);
  assert.deepEqual(result, [{ field: field('threshold'), override: '99' }]);
});

test('a field removed from the SCXML is dropped even if it was in previous entries', () => {
  const previous: OverrideEntry[] = [{ field: field('gone'), override: '1' }];
  const result = mergeConfigEntries([field('kept')], [{ name: 'kept', override: '7' }], previous);
  assert.deepEqual(result, [{ field: field('kept'), override: '7' }]);
});

test('a null override value from the host is treated as blank', () => {
  const result = mergeConfigEntries(
    [field('threshold')],
    [{ name: 'threshold', override: null as unknown as string }],
    [],
  );
  assert.deepEqual(result, [{ field: field('threshold'), override: '' }]);
});

console.log(`\n${passed} tests passed`);
