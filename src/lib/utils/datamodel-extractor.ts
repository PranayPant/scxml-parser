/**
 * Extracts all <data id="..."> variable names from an SCXML document.
 */
export function extractDatamodelVariables(xmlContent: string): string[] {
  const ids: string[] = [];
  const regex = /<data\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xmlContent)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}
