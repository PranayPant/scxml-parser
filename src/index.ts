/**
 * @your-org/scxml-parser
 *
 * Headless SCXML parsing, validation, and serialization engine. Fully
 * UI-agnostic: works in Node.js, browsers, CLIs, and host applications.
 */
import { parseSCXML } from './parser';
import { serializeSCXML } from './serializer';
import type {
  ParseResult,
  PrintASTOptions,
  SCXMLDocument,
  SerializationOptions,
  ValidationDiagnostic,
} from './types';
import type { MermaidOptions } from './utils/mermaid';
import { toMermaid } from './utils/mermaid';
import { printAST } from './utils/printer';
import { validateAST } from './validator';

export * from './types';
export type { MermaidOptions } from './utils/mermaid';
export { toMermaid } from './utils/mermaid';

export { parseSCXML, printAST, serializeSCXML, validateAST };

/**
 * Unified headless SCXML engine providing a single static facade over the
 * parse / validate / serialize / print / mermaid pipeline.
 */
export class SCXMLEngine {
  /** Parses an SCXML string into an in-memory AST. */
  static parse(xmlString: string): ParseResult {
    return parseSCXML(xmlString);
  }

  /** Validates an in-memory AST against W3C and structural integrity rules. */
  static validate(doc: SCXMLDocument): ValidationDiagnostic[] {
    return validateAST(doc);
  }

  /** Serializes an AST back to formatted SCXML XML. */
  static serialize(doc: SCXMLDocument, options?: SerializationOptions): string {
    return serializeSCXML(doc, options);
  }

  /** Prints an AST hierarchy as a visual tree for debugging. */
  static print(doc: SCXMLDocument, options?: PrintASTOptions): string {
    return printAST(doc, options);
  }

  /** Renders an AST as a Mermaid state diagram for IDE/editor preview. */
  static toMermaid(doc: SCXMLDocument, options?: MermaidOptions): string {
    return toMermaid(doc, options);
  }
}
