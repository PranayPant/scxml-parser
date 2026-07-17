import { BaseCommand, type CommandResult } from './base-command';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { wouldConflictIfMarkedInitial } from '@/lib/utils/initial-group-utils';

/**
 * ToggleInitialStateCommand
 *
 * Adds or removes a state's id from its direct parent's `initial` attribute
 * (space-separated list), marking/unmarking it as the root of an independent
 * Initial State group. Unmarking always succeeds, even when it's the sole
 * marker — a chain temporarily having zero Initial states is a valid editing
 * state (a compound state losing its only initial designation is caught by
 * the existing validateCompoundStates persistent validator, surfaced in the
 * Errors panel, not blocked here — blocking it here would create a deadlock:
 * you could never reassign a chain's Initial marker to a different sibling,
 * since marking that sibling first is refused by the check below). Refuses
 * to mark a state Initial when it's already transitively connected to
 * another Initial-marked sibling, since that would merge two groups.
 */
export class ToggleInitialStateCommand extends BaseCommand {
  private previousInitialValue?: string | null;

  constructor(private stateId: string) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement || !stateElement.parentElement) {
      return this.createFailureResult(
        `State element not found: ${this.stateId}`,
        scxmlContent
      );
    }
    const parent = stateElement.parentElement;

    const currentValue = parent.getAttribute('initial') || '';
    const tokens = currentValue.split(/\s+/).filter(Boolean);
    const isCurrentlyInitial = tokens.includes(this.stateId);

    this.previousInitialValue = parent.hasAttribute('initial') ? currentValue : null;

    if (isCurrentlyInitial) {
      const updated = tokens.filter((t) => t !== this.stateId);
      if (updated.length > 0) {
        parent.setAttribute('initial', updated.join(' '));
      } else {
        parent.removeAttribute('initial');
      }
    } else {
      const parseResult = new SCXMLParser().parse(scxmlContent);
      if (parseResult.success && parseResult.data) {
        const conflict = wouldConflictIfMarkedInitial(parseResult.data, this.stateId);
        if (conflict.blocked) {
          return this.createFailureResult(
            conflict.reason || `Cannot mark '${this.stateId}' as an Initial State.`,
            scxmlContent
          );
        }
      }
      parent.setAttribute('initial', [...tokens, this.stateId].join(' '));
    }

    return this.createSuccessResult(this.serializeXML(doc), [this.stateId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.previousInitialValue === undefined) {
      return this.createFailureResult('Nothing to undo', scxmlContent);
    }

    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement || !stateElement.parentElement) {
      return this.createFailureResult(
        `State element not found: ${this.stateId}`,
        scxmlContent
      );
    }

    const parent = stateElement.parentElement;
    if (this.previousInitialValue === null) {
      parent.removeAttribute('initial');
    } else {
      parent.setAttribute('initial', this.previousInitialValue);
    }

    return this.createSuccessResult(this.serializeXML(doc), [this.stateId]);
  }

  getDescription(): string {
    return `Toggle Initial State for "${this.stateId}"`;
  }
}
