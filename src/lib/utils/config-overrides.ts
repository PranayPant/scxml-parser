import type { ConfigField } from '@/lib/utils/datamodel-extractor';
import type { ConfigOverride } from '@/types/host-api';

export interface OverrideEntry {
  field: ConfigField;
  override: string;
}

/**
 * Combines the current SCXML's conf_ fields with host-pushed IO.conf overrides,
 * preserving any override the user is actively editing in this session (previous)
 * over what the host most recently pushed, and falling back to blank.
 */
export function mergeConfigEntries(
  fields: ConfigField[],
  overrides: ConfigOverride[],
  previous: OverrideEntry[],
): OverrideEntry[] {
  const overrideMap = Object.fromEntries(overrides.map(o => [o.name, o.override ?? '']));
  const localOverrideMap = Object.fromEntries(previous.map(e => [e.field.name, e.override]));
  return fields.map(f => ({
    field: f,
    override: localOverrideMap[f.name] ?? overrideMap[f.name] ?? '',
  }));
}
