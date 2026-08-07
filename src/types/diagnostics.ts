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
  | 'WARN_EMPTY_STATE_MACHINE';

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
