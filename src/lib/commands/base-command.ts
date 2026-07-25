/**
 * Command Pattern Base Interface
 *
 * All SCXML modification operations implement this interface.
 * This enables:
 * - Unified approach to all mutations
 * - Undo/redo functionality
 * - Clean separation of business logic from UI
 */

import { VISUAL_METADATA_CONSTANTS, isNoteId } from '@/types/visual-metadata';
import { formatXML } from '@/lib/utils/format-utils';

/**
 * Collects <viz:note> elements in the declared traversal order used for
 * "note:idx-N" fallback ids: an element's own direct note children first,
 * then its state children (recursively), then parallel children, then
 * final children. Must stay in lockstep with collectNotes() in
 * lib/converters/converter-modules/note-conversion.ts.
 */
function collectNoteElementsInDeclaredOrder(element: Element): Element[] {
  const directChildrenByTag = (tag: string): Element[] =>
    Array.from(element.children).filter((el) => el.tagName === tag);

  const result: Element[] = directChildrenByTag(
    VISUAL_METADATA_CONSTANTS.NOTE.ELEMENT_NAME
  );

  for (const tag of ['state', 'parallel', 'final']) {
    for (const child of directChildrenByTag(tag)) {
      result.push(...collectNoteElementsInDeclaredOrder(child));
    }
  }

  return result;
}

export interface CommandResult {
  /**
   * The new SCXML content after applying the command
   */
  newContent: string;

  /**
   * Whether the command executed successfully
   */
  success: boolean;

  /**
   * Error message if command failed
   */
  error?: string;

  /**
   * List of element IDs affected by this command
   * Useful for triggering selective re-renders
   */
  affectedElements?: string[];
}

export interface Command {
  /**
   * Execute the command on the given SCXML content
   * @param scxmlContent - The current SCXML XML string
   * @returns Result containing new content and success status
   */
  execute(scxmlContent: string): CommandResult;

  /**
   * Undo the command on the given SCXML content
   * @param scxmlContent - The current SCXML XML string
   * @returns Result containing reverted content and success status
   */
  undo(scxmlContent: string): CommandResult;

  /**
   * Get a human-readable description of what this command does
   * Used for history/undo UI
   */
  getDescription(): string;
}

/**
 * Base class providing common XML manipulation utilities
 */
export abstract class BaseCommand implements Command {
  /**
   * Parse XML string to DOM Document
   */
  protected parseXML(scxmlContent: string): {
    doc: Document | null;
    error?: string;
  } {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(scxmlContent, 'text/xml');

      // Check for parsing errors
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        return {
          doc: null,
          error: `XML parsing error: ${parseError.textContent}`
        };
      }

      return { doc };
    } catch (error) {
      return {
        doc: null,
        error: error instanceof Error ? error.message : 'Unknown parsing error'
      };
    }
  }

  /**
   * Serialize DOM Document to XML string
   */
  protected serializeXML(doc: Document): string {
    const serializer = new XMLSerializer();
    return formatXML(serializer.serializeToString(doc));
  }

  /**
   * Find a state element by ID (works for <state>, <parallel>, <final>)
   */
  protected findStateElement(doc: Document, stateId: string): Element | null {
    return doc.querySelector(
      `state[id="${stateId}"], parallel[id="${stateId}"], final[id="${stateId}"]`
    );
  }

  /**
   * Whether a node id refers to a post-it note annotation
   */
  protected isNoteId(nodeId: string): boolean {
    return isNoteId(nodeId);
  }

  /**
   * Find a <viz:note> element by its viz:id.
   * Uses getElementsByTagName because CSS selectors cannot match the
   * qualified name of a namespaced element. Supports the transient
   * "note:idx-N" fallback ids (used for one render cycle before ids are
   * persisted) via collectNoteElementsInDeclaredOrder, which MUST use the
   * exact same traversal rule as collectNotes() in
   * lib/converters/converter-modules/note-conversion.ts (own notes first,
   * then state/parallel/final children recursively, in that tag priority) —
   * that object-model traversal cannot preserve true document order across
   * different tag types, so the DOM fallback here matches its declared
   * order instead, rather than getElementsByTagName's real DOM order.
   */
  protected findNoteElement(doc: Document, noteId: string): Element | null {
    const notes = doc.getElementsByTagName(
      VISUAL_METADATA_CONSTANTS.NOTE.ELEMENT_NAME
    );
    for (let i = 0; i < notes.length; i++) {
      if (notes[i].getAttribute('viz:id') === noteId) {
        return notes[i];
      }
    }
    const indexMatch = noteId.match(/^note:idx-(\d+)$/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1], 10);
      const candidate = collectNoteElementsInDeclaredOrder(doc.documentElement)[index];
      // Only trust the positional fallback if that note has no persisted id
      if (candidate && !candidate.getAttribute('viz:id')) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Ensure viz namespace is declared on root element
   */
  protected ensureVizNamespace(doc: Document): void {
    const root = doc.documentElement;
    if (root && !root.hasAttribute('xmlns:viz')) {
      root.setAttribute('xmlns:viz', VISUAL_METADATA_CONSTANTS.NAMESPACE_URI);
    }
  }

  /**
   * Create a success result
   */
  protected createSuccessResult(
    newContent: string,
    affectedElements?: string[]
  ): CommandResult {
    return {
      newContent,
      success: true,
      affectedElements
    };
  }

  /**
   * Create a failure result
   */
  protected createFailureResult(
    error: string,
    originalContent: string
  ): CommandResult {
    return {
      newContent: originalContent,
      success: false,
      error
    };
  }

  // Abstract methods that subclasses must implement
  abstract execute(scxmlContent: string): CommandResult;
  abstract undo(scxmlContent: string): CommandResult;
  abstract getDescription(): string;
}
