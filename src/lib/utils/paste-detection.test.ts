import { describe, it, expect } from 'vitest';
import { isWholeDocumentPasteRange } from './paste-detection';

describe('isWholeDocumentPasteRange', () => {
  it('returns true when the pasted range spans from the very start to the very end of the model', () => {
    expect(
      isWholeDocumentPasteRange({
        rangeStartLineNumber: 1,
        rangeStartColumn: 1,
        rangeEndLineNumber: 10,
        rangeEndColumn: 8,
        modelLineCount: 10,
        modelLastLineMaxColumn: 8,
      })
    ).toBe(true);
  });

  it('returns true for a single-line document fully replaced', () => {
    expect(
      isWholeDocumentPasteRange({
        rangeStartLineNumber: 1,
        rangeStartColumn: 1,
        rangeEndLineNumber: 1,
        rangeEndColumn: 42,
        modelLineCount: 1,
        modelLastLineMaxColumn: 42,
      })
    ).toBe(true);
  });

  it('returns false when the paste starts partway through the document', () => {
    expect(
      isWholeDocumentPasteRange({
        rangeStartLineNumber: 3,
        rangeStartColumn: 1,
        rangeEndLineNumber: 10,
        rangeEndColumn: 8,
        modelLineCount: 10,
        modelLastLineMaxColumn: 8,
      })
    ).toBe(false);
  });

  it('returns false when the paste starts mid-line rather than at column 1', () => {
    expect(
      isWholeDocumentPasteRange({
        rangeStartLineNumber: 1,
        rangeStartColumn: 5,
        rangeEndLineNumber: 10,
        rangeEndColumn: 8,
        modelLineCount: 10,
        modelLastLineMaxColumn: 8,
      })
    ).toBe(false);
  });

  it('returns false when the paste does not reach the last line of the resulting document', () => {
    expect(
      isWholeDocumentPasteRange({
        rangeStartLineNumber: 1,
        rangeStartColumn: 1,
        rangeEndLineNumber: 5,
        rangeEndColumn: 8,
        modelLineCount: 10,
        modelLastLineMaxColumn: 8,
      })
    ).toBe(false);
  });

  it('returns false when the paste ends before the last column of the last line', () => {
    expect(
      isWholeDocumentPasteRange({
        rangeStartLineNumber: 1,
        rangeStartColumn: 1,
        rangeEndLineNumber: 10,
        rangeEndColumn: 3,
        modelLineCount: 10,
        modelLastLineMaxColumn: 8,
      })
    ).toBe(false);
  });
});
