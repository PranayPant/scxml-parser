export interface WholeDocumentPasteRangeInput {
  rangeStartLineNumber: number;
  rangeStartColumn: number;
  rangeEndLineNumber: number;
  rangeEndColumn: number;
  modelLineCount: number;
  modelLastLineMaxColumn: number;
}

/**
 * True when a pasted range spans the entire document (line 1, column 1 through the last
 * line/column of the model) — i.e. the user selected everything (or pasted into an empty
 * editor) and pasted a complete replacement document, as opposed to pasting a snippet into
 * existing content.
 */
export function isWholeDocumentPasteRange(input: WholeDocumentPasteRangeInput): boolean {
  return (
    input.rangeStartLineNumber === 1 &&
    input.rangeStartColumn === 1 &&
    input.rangeEndLineNumber === input.modelLineCount &&
    input.rangeEndColumn === input.modelLastLineMaxColumn
  );
}
