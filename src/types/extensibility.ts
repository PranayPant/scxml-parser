/**
 * Extensibility contracts for registering custom (non-standard) SCXML tags.
 *
 * Following the Open-Closed Principle, consumers can register domain-specific
 * XML tags (e.g. `<gate>`, `<policy>`, `<rule>`) without modifying the core
 * parser, validator, or serializer. Each registered tag supplies its own
 * parse, validate, and serialize hooks and a typed AST node via
 * `CustomTagSpec<T>`.
 */
import type { SCXMLElement, StateNode, Transition } from './ast';
import type { ValidationDiagnostic } from './diagnostics';

/**
 * Representational contract for custom parsed AST nodes. Every custom tag is
 * stored as a structured node within the `customChildren` array on standard
 * SCXML AST nodes.
 */
export interface CustomASTNode {
  /** Discriminator: this node is a custom extension, not a standard node. */
  type: 'custom';
  /** The exact XML tag name. */
  tagName: string;
  /** Raw string attributes from the source XML. */
  attributes: Record<string, string>;
  /** Nested custom / standard children, when present. */
  children?: (CustomASTNode | StateNode | Transition)[];
  /** Raw text content of the element, when present. */
  textContent?: string;
  /** Optional strongly-typed, tag-specific payload. */
  payload?: Record<string, unknown>;
}

/**
 * Context passed to a custom tag's `parse` handler so it can build a typed
 * AST node from the raw XML fragment.
 */
export interface CustomTagParseContext {
  /** The lowercase tag name being parsed. */
  tagName: string;
  /** Raw string attributes from the source XML. */
  attributes: Record<string, string>;
  /** Raw nested child records produced by the XML parser. */
  children: unknown[];
  /** Text content, when present. */
  textContent?: string;
  /** The parent AST node that will own this custom node. */
  parentASTNode: SCXMLElement | StateNode | Transition;
}

/**
 * Complete extension contract required to define a custom SCXML tag.
 */
export interface CustomTagSpec<T extends CustomASTNode = CustomASTNode> {
  /** The exact XML tag name (registered case-insensitively). */
  tagName: string;
  /** Allowed parent AST contexts (tag names), e.g. ['transition', 'state']. */
  allowedParents?: string[];
  /** Transforms raw XML attributes and children into a typed AST node. */
  parse: (ctx: CustomTagParseContext) => T;
  /** Validates a custom AST node, returning zero or more diagnostics. */
  validate?: (node: T, parentNode: SCXMLElement | StateNode | Transition) => ValidationDiagnostic[];
  /** Serializes a custom AST node back into a formatted XML string. */
  serialize?: (node: T, indentLevel: number) => string;
}
