import { BaseCommand, type CommandResult } from './base-command';
import { clearWaypointsForTouchingTransitions } from './waypoint-invalidation';

/**
 * RenameStateCommand
 *
 * Renames a state and updates all references to it
 * - Updates the state's @id attribute
 * - Updates all transition @target attributes pointing to this state
 * - Updates parent's @initial attribute if it points to this state
 *
 * A longer/shorter id also changes the node's rendered width (see
 * NodeDimensionCalculator, which sizes by label length — the label is the
 * state id), so stale persisted `viz:waypoints` on transitions touching it
 * are cleared too (see waypoint-invalidation.ts). Undo re-runs execute()
 * with the names swapped, which naturally re-clears them as the node
 * resizes back — no explicit restore needed here.
 */
export class RenameStateCommand extends BaseCommand {
  private oldId?: string;

  constructor(
    private stateId: string,
    private newId: string
  ) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    // Find the state element
    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement) {
      return this.createFailureResult(
        `State element not found: ${this.stateId}`,
        scxmlContent
      );
    }

    // Store old ID for undo
    this.oldId = this.stateId;

    // Update the state's ID
    stateElement.setAttribute('id', this.newId);

    // Update all transitions that target this state
    const transitions = doc.querySelectorAll(`transition[target="${this.stateId}"]`);
    transitions.forEach((transition) => {
      transition.setAttribute('target', this.newId);
    });

    // Update parent's initial attribute if it references this state — token-aware
    // so a multi-value list ("A B") only has the renamed token replaced, not wiped.
    const elementsWithInitial = doc.querySelectorAll('[initial]');
    elementsWithInitial.forEach((element) => {
      const tokens = (element.getAttribute('initial') || '').split(/\s+/).filter(Boolean);
      if (tokens.includes(this.stateId)) {
        const updated = tokens.map((t) => (t === this.stateId ? this.newId : t));
        element.setAttribute('initial', updated.join(' '));
      }
    });

    clearWaypointsForTouchingTransitions(doc, this.newId);

    // Serialize and return
    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.stateId, this.newId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (!this.oldId) {
      return this.createFailureResult(
        'No previous ID to restore',
        scxmlContent
      );
    }

    // Create inverse command
    const inverseCommand = new RenameStateCommand(this.newId, this.oldId);
    return inverseCommand.execute(scxmlContent);
  }

  getDescription(): string {
    return `Rename "${this.stateId}" to "${this.newId}"`;
  }
}
