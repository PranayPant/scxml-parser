import { describe, it, expect } from 'vitest';
import { RenameStateCommand } from './rename-state-command';

const SCXML_HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';
const VIZ_HEADER =
  '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"';

describe('RenameStateCommand', () => {
  it('updates a single-value initial attribute (existing behavior)', () => {
    const xml = `${SCXML_HEADER} initial="A"><state id="A"/><state id="B"/></scxml>`;
    const result = new RenameStateCommand('A', 'A2').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A2"');
  });

  it('replaces only the renamed token in a multi-value initial attribute, preserving the rest', () => {
    const xml = `${SCXML_HEADER} initial="A B"><state id="A"/><state id="B"/></scxml>`;
    const result = new RenameStateCommand('A', 'A2').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A2 B"');
  });

  it('updates a multi-value initial attribute on a nested compound state', () => {
    const xml = `${SCXML_HEADER}><state id="Parent" initial="ChildA ChildB"><state id="ChildA"/><state id="ChildB"/></state></scxml>`;
    const result = new RenameStateCommand('ChildB', 'ChildB2').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="ChildA ChildB2"');
  });

  it('leaves an initial attribute untouched when it does not reference the renamed state', () => {
    const xml = `${SCXML_HEADER} initial="A B"><state id="A"/><state id="B"/><state id="C"/></scxml>`;
    const result = new RenameStateCommand('C', 'C2').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A B"');
  });

  describe('waypoint invalidation', () => {
    // A longer/shorter id changes the node's rendered width (label length),
    // so stale persisted viz:waypoints on transitions touching it must be
    // cleared, or the edge renders against the pre-rename size.
    it('clears viz:waypoints on the renamed state\'s own outgoing transition', () => {
      const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`;
      const result = new RenameStateCommand('A', 'A_much_longer_name').execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).not.toContain('viz:waypoints');
      expect(result.newContent).toContain('id="A_much_longer_name"');
    });

    it('clears viz:waypoints on a sibling\'s transition targeting the renamed state', () => {
      const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1;2,2"/></state><state id="B"/></scxml>`;
      const result = new RenameStateCommand('B', 'B_much_longer_name').execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).not.toContain('viz:waypoints');
    });

    it('leaves unrelated transitions\' waypoints untouched', () => {
      const xml = `${VIZ_HEADER}><state id="A"><transition target="B" viz:waypoints="1,1"/></state><state id="B"><transition target="C" viz:waypoints="2,2"/></state><state id="C"/></scxml>`;
      const result = new RenameStateCommand('A', 'A2').execute(xml);
      expect(result.success).toBe(true);
      expect(result.newContent).toContain('viz:waypoints="2,2"');
    });
  });
});
