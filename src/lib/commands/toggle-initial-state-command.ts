import { BaseCommand, type CommandResult } from './base-command';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { wouldConflictIfMarkedInitial } from '@/lib/utils/initial-group-utils';

/**
 * ToggleInitialStateCommand
 *
 * Adds or removes a state's id from its direct parent's Initial designation.
 * SCXML allows two ways to express this: the `initial` attribute
 * (space-separated list) and the older `<initial><transition target="X"/></initial>`
 * child element (single target). This command reads both — merging whichever
 * ids each currently names — and always *writes* back using the attribute
 * form only, removing any pre-existing `<initial>` element in the process.
 * That's a one-time normalization the first time a container's Initial
 * designation is touched via this command; it's necessary because the
 * attribute form is the only one that supports more than one Initial id, and
 * keeping both forms simultaneously would just be two disagreeing sources of
 * truth for the same thing. Undo restores the original element verbatim
 * (the same DOM node instance, re-imported) if one existed.
 *
 * Unmarking always succeeds, even when it's the sole marker — a chain
 * temporarily having zero Initial states is a valid editing state (a
 * compound state losing its only initial designation is caught by the
 * existing validateCompoundStates persistent validator, surfaced in the
 * Errors panel, not blocked here — blocking it here would create a deadlock:
 * you could never reassign a chain's Initial marker to a different sibling,
 * since marking that sibling first is refused by the check below). Refuses
 * to mark a state Initial when it's already transitively connected to
 * another Initial-marked sibling, since that would merge two groups.
 */
export class ToggleInitialStateCommand extends BaseCommand {
  private previousInitialAttr?: string | null;
  private previousInitialElement?: Element | null;

  constructor(private stateId: string) {
    super();
  }

  private findInitialElement(parent: Element): Element | null {
    return (
      Array.from(parent.children).find((el) => el.tagName === 'initial') ?? null
    );
  }

  private getInitialElementTargetTokens(initialElement: Element | null): string[] {
    if (!initialElement) return [];
    const transition = initialElement.querySelector('transition');
    const target = transition?.getAttribute('target') || '';
    return target.split(/\s+/).filter(Boolean);
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

    const initialElement = this.findInitialElement(parent);
    const attrTokens = (parent.getAttribute('initial') || '').split(/\s+/).filter(Boolean);
    const elementTokens = this.getInitialElementTargetTokens(initialElement);
    const mergedTokens = Array.from(new Set([...attrTokens, ...elementTokens]));

    this.previousInitialAttr = parent.hasAttribute('initial')
      ? parent.getAttribute('initial')
      : null;
    this.previousInitialElement = initialElement;

    const isCurrentlyInitial = mergedTokens.includes(this.stateId);

    if (isCurrentlyInitial) {
      const updated = mergedTokens.filter((t) => t !== this.stateId);
      if (initialElement) parent.removeChild(initialElement);
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
      if (initialElement) parent.removeChild(initialElement);
      parent.setAttribute('initial', [...mergedTokens, this.stateId].join(' '));
    }

    return this.createSuccessResult(this.serializeXML(doc), [this.stateId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.previousInitialAttr === undefined) {
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

    // Defensive: remove whatever execute() wrote before restoring.
    const currentInitialElement = this.findInitialElement(parent);
    if (currentInitialElement) parent.removeChild(currentInitialElement);

    if (this.previousInitialAttr === null) {
      parent.removeAttribute('initial');
    } else {
      parent.setAttribute('initial', this.previousInitialAttr);
    }

    if (this.previousInitialElement) {
      const imported = doc.importNode(this.previousInitialElement, true);
      parent.insertBefore(imported, parent.firstChild);
    }

    return this.createSuccessResult(this.serializeXML(doc), [this.stateId]);
  }

  getDescription(): string {
    return `Toggle Initial State for "${this.stateId}"`;
  }
}
