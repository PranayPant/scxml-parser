import { describe, it, expect } from 'vitest';
import { AddParallelStateCommand } from './add-parallel-state-command';

const baseXml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
  <state id="idle"/>
</scxml>`;

describe('AddParallelStateCommand', () => {
  it('inserts a <parallel> with two default region <state> children at root level', () => {
    const command = new AddParallelStateCommand(
      'running', 'region_1', 'region_2', 100, 100, 300, 200
    );
    const result = command.execute(baseXml);

    expect(result.success).toBe(true);
    expect(result.newContent).toContain('<parallel id="running"');
    expect(result.newContent).toContain('<state id="region_1"');
    expect(result.newContent).toContain('<state id="region_2"');
    expect(result.affectedElements).toEqual(['running', 'region_1', 'region_2']);
  });

  it('nests the parallel under parentId when given', () => {
    const nestedXml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outer">
      <state id="outer" initial="idle">
        <state id="idle"/>
      </state>
    </scxml>`;

    const command = new AddParallelStateCommand(
      'running', 'region_1', 'region_2', 0, 0, 300, 200, 'outer'
    );
    const result = command.execute(nestedXml);

    expect(result.success).toBe(true);
    const parallelIndex = result.newContent.indexOf('<parallel id="running"');
    const outerCloseIndex = result.newContent.indexOf('</state>');
    expect(parallelIndex).toBeGreaterThan(-1);
    expect(parallelIndex).toBeLessThan(result.newContent.lastIndexOf('</state>'));
  });

  it('fails cleanly when parentId does not exist', () => {
    const command = new AddParallelStateCommand(
      'running', 'region_1', 'region_2', 0, 0, 300, 200, 'missing_parent'
    );
    const result = command.execute(baseXml);

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing_parent');
  });

  it('undo removes the parallel and both regions', () => {
    const command = new AddParallelStateCommand(
      'running', 'region_1', 'region_2', 0, 0, 300, 200
    );
    const added = command.execute(baseXml);
    const undone = command.undo(added.newContent);

    expect(undone.success).toBe(true);
    expect(undone.newContent).not.toContain('running');
    expect(undone.newContent).not.toContain('region_1');
  });
});
