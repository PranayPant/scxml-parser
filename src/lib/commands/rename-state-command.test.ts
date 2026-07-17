import { describe, it, expect } from 'vitest';
import { RenameStateCommand } from './rename-state-command';

const SCXML_HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';

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
});
