import { BaseCommand, type CommandResult } from './base-command';

/**
 * AddParallelStateCommand
 *
 * Inserts a new <parallel> state with two default plain <state> regions
 * (no substates, so neither needs an `initial` attribute per the SCXML spec).
 * Placed at the document root, or under parentId when the caller has
 * navigated into a state.
 */
export class AddParallelStateCommand extends BaseCommand {
  constructor(
    private parallelId: string,
    private region1Id: string,
    private region2Id: string,
    private x: number,
    private y: number,
    private width: number,
    private height: number,
    private parentId?: string
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

    const parentElement = this.parentId
      ? this.findStateElement(doc, this.parentId)
      : doc.documentElement;
    if (!parentElement) {
      return this.createFailureResult(
        `Parent state element not found: ${this.parentId}`,
        scxmlContent
      );
    }

    this.ensureVizNamespace(doc);
    const ns = doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';

    const parallelElement = doc.createElementNS(ns, 'parallel');
    parallelElement.setAttribute('id', this.parallelId);
    parallelElement.setAttribute(
      'viz:xywh',
      `${Math.round(this.x)},${Math.round(this.y)},${Math.round(this.width)},${Math.round(this.height)}`
    );

    const region1 = doc.createElementNS(ns, 'state');
    region1.setAttribute('id', this.region1Id);
    const region2 = doc.createElementNS(ns, 'state');
    region2.setAttribute('id', this.region2Id);

    parallelElement.appendChild(region1);
    parallelElement.appendChild(region2);
    parentElement.appendChild(parallelElement);

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [
      this.parallelId,
      this.region1Id,
      this.region2Id,
    ]);
  }

  undo(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    const parallelElement = this.findStateElement(doc, this.parallelId);
    if (!parallelElement) {
      return this.createFailureResult(
        `Parallel state element not found: ${this.parallelId}`,
        scxmlContent
      );
    }

    parallelElement.parentNode?.removeChild(parallelElement);

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.parallelId]);
  }

  getDescription(): string {
    return `Add parallel state "${this.parallelId}"`;
  }
}
