/**
 * Options types for the headless SCXML engine operations
 * (serialization and AST printing).
 */

/**
 * Options controlling AST -> XML serialization.
 */
export interface SerializationOptions {
  /** Pretty-print the output with indentation. Default true. */
  pretty?: boolean;
  /** Number of spaces per indentation level. Default 2. */
  indent?: number;
  /** Whether to escape reserved XML characters in text/expression content. Default true. */
  escapeText?: boolean;
  /** Include detected/annotated state type attributes. Default false. */
  includeStateTypes?: boolean;
}

/**
 * Options controlling the visual AST debugger output.
 */
export interface PrintASTOptions {
  /** Include domain metadata blocks in the output. Default true. */
  includeMetadata?: boolean;
  /** Include the datamodel section in the output. Default true. */
  includeDatamodel?: boolean;
  /** Include transitions on each state. Default true. */
  includeTransitions?: boolean;
  /** Include executable content detail. Default false. */
  includeExecutable?: boolean;
}
