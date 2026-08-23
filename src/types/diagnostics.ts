/**
 * Core diagnostic types for the headless SCXML engine.
 *
 * These mirror the validation error shape used across the engine so that
 * consumers (editors, CLIs, host applications) can rely on a single,
 * stable contract regardless of which stage produced the diagnostic.
 */
import type { SCXMLDocument } from './ast';

/**
 * Severity levels for validation diagnostics.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * A single validation diagnostic produced by the engine.
 */
export interface ValidationDiagnostic {
  /** Human-readable description of the problem. */
  message: string;
  /** Stable machine-readable error code (e.g. ERR_INVALID_TARGET). */
  code?: DiagnosticCode;
  /** Severity of the diagnostic. */
  severity: DiagnosticSeverity;
  /** 1-based line in the original XML source, when available. */
  line?: number;
  /** 1-based column in the original XML source, when available. */
  column?: number;
  /**
   * The id of the AST node the diagnostic refers to (when known). Populated
   * by structural/semantic validation; absent for XML syntax diagnostics.
   * Useful for mapping diagnostics onto canvas nodes/edges.
   */
  nodeId?: string;
  /**
   * The stable id of the transition the diagnostic refers to (when known).
   * See `Transition.id`; absent for XML syntax diagnostics.
   */
  transitionId?: string;
}

/**
 * Stable diagnostic error codes emitted by the validator.
 */
export type DiagnosticCode =
  | 'ERR_INVALID_TRANSITION_TARGET'
  | 'ERR_DUPLICATE_STATE_ID'
  | 'ERR_DUPLICATE_DATA_ID'
  | 'ERR_INITIAL_STATE_NOT_FOUND'
  | 'ERR_INVALID_TRANSITION_TYPE'
  | 'ERR_UNREACHABLE_STATE'
  | 'ERR_INVALID_EVENT_NAME'
  | 'ERR_ROOT_NOT_SCXML'
  | 'ERR_XML_SYNTAX'
  | 'ERR_INVALID_INITIAL_GROUP'
  | 'ERR_INVALID_CONDITION'
  | 'ERR_MISSING_REQUIRED_ATTRIBUTE'
  | 'ERR_INVALID_ATTRIBUTE_VALUE'
  | 'ERR_CUSTOM_TAG_INVALID_PARENT'
  | 'WARN_CUSTOM_TAG_OUTSIDE_METADATA'
  | 'WARN_UNREGISTERED_METADATA_TAG'
  | 'WARN_EMPTY_STATE_MACHINE'
  | 'WARN_COMPOUND_STATE_NO_INITIAL';

/**
 * Result of a parse operation.
 */
export interface ParseResult {
  /** Whether parsing succeeded without fatal (error-severity) diagnostics. */
  success: boolean;
  /** The parsed AST when parsing succeeded, otherwise undefined. */
  data?: SCXMLDocument;
  /** Diagnostics collected during parsing. */
  errors: ValidationDiagnostic[];
}

/**
 * Result of a best-effort parse operation.
 *
 * Unlike `ParseResult`, `data` is **always** populated with an `SCXMLDocument`
 * so a consumer (e.g. an editor) always has a tree to render, even when the
 * input is transiently malformed. Use `recoverable` to distinguish a fully
 * parsed document (`true`) from a degraded fallback (`false`).
 */
export interface PartialParseResult {
  /** The best-effort AST. Always defined. */
  data: SCXMLDocument;
  /** Diagnostics; error-severity entries indicate where recovery occurred. */
  errors: ValidationDiagnostic[];
  /** False when the input was too malformed to fully parse (data is a fallback). */
  recoverable: boolean;
}
