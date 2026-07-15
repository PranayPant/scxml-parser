import { BaseCommand, type CommandResult } from './base-command';

/**
 * AddRegionCommand
 *
 * Appends one more plain <state> region under an existing <parallel>.
 * The new region has no substates, so no `initial` attribute is required.
 */
export class AddRegionCommand extends BaseCommand {
  constructor(
    private parallelId: string,
    private regionId: string
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

    const parallelElement = doc.querySelector(`parallel[id="${this.parallelId}"]`);
    if (!parallelElement) {
      return this.createFailureResult(
        `Parallel state element not found: ${this.parallelId}`,
        scxmlContent
      );
    }

    const ns = doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';
    const regionElement = doc.createElementNS(ns, 'state');
    regionElement.setAttribute('id', this.regionId);
    parallelElement.appendChild(regionElement);

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.regionId]);
  }

  undo(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    const regionElement = this.findStateElement(doc, this.regionId);
    if (!regionElement) {
      return this.createFailureResult(
        `Region element not found: ${this.regionId}`,
        scxmlContent
      );
    }

    regionElement.parentNode?.removeChild(regionElement);

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.regionId]);
  }

  getDescription(): string {
    return `Add region "${this.regionId}" to parallel "${this.parallelId}"`;
  }
}
