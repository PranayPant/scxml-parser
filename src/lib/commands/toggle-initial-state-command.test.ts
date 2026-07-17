import { describe, it, expect } from 'vitest';
import { ToggleInitialStateCommand } from './toggle-initial-state-command';

const SCXML_HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';

describe('ToggleInitialStateCommand', () => {
  it('marks a previously-unmarked root state as Initial by adding it to a fresh initial attribute', () => {
    const xml = `${SCXML_HEADER}><state id="A"/><state id="B"/></scxml>`;
    const result = new ToggleInitialStateCommand('A').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A"');
  });

  it('marks a second root state as Initial by appending to an existing initial attribute', () => {
    const xml = `${SCXML_HEADER} initial="A"><state id="A"/><state id="B"/></scxml>`;
    const result = new ToggleInitialStateCommand('B').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A B"');
  });

  it('unmarks a state by removing just its token, preserving the rest', () => {
    const xml = `${SCXML_HEADER} initial="A B"><state id="A"/><state id="B"/></scxml>`;
    const result = new ToggleInitialStateCommand('A').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="B"');
    expect(result.newContent).not.toMatch(/initial="[^"]*A[^"]*"/);
  });

  it('allows unmarking the only root Initial state, clearing the attribute entirely', () => {
    const xml = `${SCXML_HEADER} initial="A"><state id="A"/></scxml>`;
    const result = new ToggleInitialStateCommand('A').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('initial=');
  });

  it('allows unmarking one of several root Initial states, preserving the rest', () => {
    const xml = `${SCXML_HEADER} initial="A B"><state id="A"/><state id="B"/></scxml>`;
    const result = new ToggleInitialStateCommand('A').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="B"');
  });

  it('allows unmarking the sole Initial state of a nested compound parent, clearing its attribute', () => {
    // This temporarily leaves the compound state without an initial
    // designation, which is a valid (if momentarily invalid-per-spec) editing
    // state — caught by the existing validateCompoundStates persistent
    // validator (Errors panel), not blocked here. Blocking it here would make
    // it impossible to ever reassign which child is Initial: marking a
    // sibling first is refused by wouldConflictIfMarkedInitial since it's
    // already connected to the current marker.
    const xml = `${SCXML_HEADER}><state id="Parent" initial="Child"><state id="Child"/></state></scxml>`;
    const result = new ToggleInitialStateCommand('Child').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('initial=');
  });

  it('allows unmarking one of several Initial states in the same nested parent', () => {
    const xml = `${SCXML_HEADER}><state id="Parent" initial="ChildA ChildB"><state id="ChildA"/><state id="ChildB"/></state></scxml>`;
    const result = new ToggleInitialStateCommand('ChildA').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="ChildB"');
  });

  it('undo restores the exact prior initial attribute value', () => {
    const xml = `${SCXML_HEADER} initial="A"><state id="A"/><state id="B"/></scxml>`;
    const command = new ToggleInitialStateCommand('B');
    const result = command.execute(xml);
    expect(result.newContent).toContain('initial="A B"');
    const undone = command.undo(result.newContent);
    expect(undone.success).toBe(true);
    expect(undone.newContent).toContain('initial="A"');
    expect(undone.newContent).not.toContain('initial="A B"');
  });

  it('undo restores an absent initial attribute after marking a fresh one', () => {
    const xml = `${SCXML_HEADER}><state id="A"/></scxml>`;
    const command = new ToggleInitialStateCommand('A');
    const result = command.execute(xml);
    expect(result.newContent).toContain('initial="A"');
    const undone = command.undo(result.newContent);
    expect(undone.success).toBe(true);
    expect(undone.newContent).not.toContain('initial=');
  });

  it('fails to mark a state Initial when it is already connected to another Initial state in the same chain', () => {
    // Reproduces the reported bug: main_region (Initial) --event--> state_2,
    // marking state_2 Initial too must be refused since it would merge two
    // Initial State groups into one chain.
    const xml = `${SCXML_HEADER} initial="main_region"><state id="main_region"><transition event="event" target="state_2"/></state><state id="state_2"/></scxml>`;
    const result = new ToggleInitialStateCommand('state_2').execute(xml);
    expect(result.success).toBe(false);
    expect(result.newContent).toBe(xml);
    expect(result.error).toContain('main_region');
  });

  it('still allows marking an unconnected state Initial alongside an existing Initial group', () => {
    const xml = `${SCXML_HEADER} initial="main_region"><state id="main_region"/><state id="island"/></scxml>`;
    const result = new ToggleInitialStateCommand('island').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="main_region island"');
  });

  it('allows reassigning a chain\'s Initial marker to a different sibling (unmark then mark)', () => {
    // Reproduces the reported deadlock: main_region --event--> state_2 is a
    // chain whose sole Initial marker is state_2. Unmark it, then mark
    // main_region instead — both steps must succeed now that unmarking is
    // never blocked.
    const xml = `${SCXML_HEADER} initial="state_2"><state id="main_region"><transition event="event" target="state_2"/></state><state id="state_2"/></scxml>`;

    const unmarkResult = new ToggleInitialStateCommand('state_2').execute(xml);
    expect(unmarkResult.success).toBe(true);
    expect(unmarkResult.newContent).not.toContain('initial=');

    const markResult = new ToggleInitialStateCommand('main_region').execute(unmarkResult.newContent);
    expect(markResult.success).toBe(true);
    expect(markResult.newContent).toContain('initial="main_region"');
  });
});
