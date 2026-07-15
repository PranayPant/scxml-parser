import { describe, it, expect } from 'vitest';
import { AddRegionCommand } from './add-region-command';

const xmlWithParallel = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
  <parallel id="running">
    <state id="region_1"/>
    <state id="region_2"/>
  </parallel>
</scxml>`;

describe('AddRegionCommand', () => {
  it('appends a new plain <state> region under the target parallel', () => {
    const result = new AddRegionCommand('running', 'region_3').execute(xmlWithParallel);

    expect(result.success).toBe(true);
    expect(result.newContent).toContain('<state id="region_3"');
    expect(result.affectedElements).toEqual(['region_3']);
  });

  it('fails cleanly when the parallel does not exist', () => {
    const result = new AddRegionCommand('missing', 'region_3').execute(xmlWithParallel);

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing');
  });

  it('undo removes just the added region, leaving the others intact', () => {
    const added = new AddRegionCommand('running', 'region_3').execute(xmlWithParallel);
    const undone = new AddRegionCommand('running', 'region_3').undo(added.newContent);

    expect(undone.success).toBe(true);
    expect(undone.newContent).not.toContain('region_3');
    expect(undone.newContent).toContain('region_1');
    expect(undone.newContent).toContain('region_2');
  });
});
