/**
 * Fixture loader for the automated test suite.
 *
 * The `examples/scxml/*.scxml` documents are the canonical example corpus.
 * This small util resolves their absolute paths and reads them so the suite
 * can parse the real examples — the same documents the orchestrator / server
 * fixtures are generated from (see `scripts/gen-fixtures.mjs`).
 *
 * Keeping these in a shared helper (rather than baking relative paths into
 * each test) means the corpus stays the single source of truth and the suite
 * is robust to where Vitest runs from.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the `examples/scxml` corpus directory. */
export const examplesDir = resolve(here, '..', 'examples', 'scxml');

/** Return the example `.scxml` file paths (absolute), sorted for determinism. */
export function listExamples(): string[] {
  return readdirSync(examplesDir)
    .filter((f) => f.endsWith('.scxml'))
    .sort()
    .map((f) => join(examplesDir, f));
}

/** Read a single example document's source by filename (without `.scxml`). */
export function readExample(name: string): string {
  return readFileSync(join(examplesDir, `${name}.scxml`), 'utf8');
}

/** Return the basename (without `.scxml`) for an example path. */
export function exampleName(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf('/') + 1, -'.scxml'.length);
}
