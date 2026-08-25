#!/usr/bin/env node
/**
 * Fixture generator.
 *
 * The parser is the **authoritative source** for AST fixtures consumed across
 * the monorepo (orchestrator + server). This script:
 *
 *   1. Parses every `examples/scxml/*.scxml` document.
 *   2. Writes the canonical AST JSON into `tests/fixtures/generated/<name>.json`
 *      (committed golden copies) plus a `manifest.json` of content hashes so
 *      the Elixir fixture-reconciler tests can verify the committed fixtures
 *      are byte-identical to what the parser produces today.
 *   3. For example documents that map to a repo fixture (by the naming
 *      convention `<example-name>.json`), copies the generated AST into the
 *      orchestrator and server `test/fixtures/` directories.
 *
 * The `traffic-light.scxml` example maps to the shared `traffic_light.json`
 * fixture used by both Elixir repos (red -> green -> yellow on `next`).
 *
 * Usage:
 *   node scripts/gen-fixtures.mjs            # regenerate everything
 *   node scripts/gen-fixtures.mjs --check    # dry-run: fail if anything is stale
 *
 * Requires the built library (`dist/`) — run `pnpm run build` first (the
 * `prepare` script does this automatically on install).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const examplesDir = join(root, 'examples', 'scxml');
const goldenDir = join(root, 'tests', 'fixtures', 'generated');
const manifestPath = join(goldenDir, 'manifest.json');

// Workspace-relative destinations that consume the generated fixtures.
// Each entry maps a fixture name -> the `test/fixtures/<name>.json` path in
// the consuming repo. The parser's example stems are normalized (dashes ->_
// underscores) to match the fixtures' naming convention.
const consumers = [
  {
    repo: 'scxml-orchestrator',
    name: 'traffic_light.json',
    source: exampleFile('traffic-light'),
  },
  {
    repo: 'scxml-http-server',
    name: 'traffic_light.json',
    source: exampleFile('traffic-light'),
  },
];

// "examples/scxml/traffic-light.scxml" -> "tests/fixtures/generated/traffic_light.json"
function exampleFile(stem) {
  return join(root, 'examples', 'scxml', `${stem}.scxml`);
}

function normalizeName(stem) {
  return stem.replace(/-/g, '_');
}

const check = process.argv.includes('--check');

// Load the built ESM bundle (self-contained, extension-resolved).
const { SCXMLEngine } = await import(pathToFileURL(join(root, 'dist', 'index.mjs')).href);

/** Parse an example and return the canonical AST JSON string (pretty, sorted). */
function parseToJson(xml) {
  const res = SCXMLEngine.parse(xml);
  if (!res.success || !res.data) {
    const msgs = (res.errors ?? []).map((d) => `${d.severity}: ${d.code} ${d.message}`).join('\n');
    throw new Error(`parse failed for example:\n${msgs}`);
  }
  return `${JSON.stringify(res.data, null, 2)}\n`;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// 1. Rebuild golden ASTs + manifest from the example corpus
// ---------------------------------------------------------------------------
const exampleFiles = readdirSync(examplesDir)
  .filter((f) => f.endsWith('.scxml'))
  .sort();

const manifest = {};
let stale = false;

for (const file of exampleFiles) {
  const stem = basename(file, '.scxml');
  const name = normalizeName(stem);
  const xml = readFileSync(join(examplesDir, file), 'utf8');
  const json = parseToJson(xml);
  const hash = sha256(json);

  const goldenPath = join(goldenDir, `${name}.json`);
  if (!check) {
    ensureDir(goldenDir);
    writeFileSync(goldenPath, json);
  } else if (existsSync(goldenPath) && readFileSync(goldenPath, 'utf8') !== json) {
    console.error(`STALE golden: ${relative(root, goldenPath)}`);
    stale = true;
  }

  manifest[name] = {
    source: `examples/scxml/${file}`,
    hash,
    file: `${name}.json`,
  };
}

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
if (!check) {
  writeFileSync(manifestPath, manifestJson);
} else if (existsSync(manifestPath) && readFileSync(manifestPath, 'utf8') !== manifestJson) {
  console.error(`STALE manifest: ${relative(root, manifestPath)}`);
  stale = true;
}

// ---------------------------------------------------------------------------
// 2. Copy generated fixtures into consuming repos
// ---------------------------------------------------------------------------
const goldenCache = new Map();
function goldenFor(name) {
  if (!goldenCache.has(name)) {
    goldenCache.set(name, readFileSync(join(goldenDir, `${name}.json`), 'utf8'));
  }
  return goldenCache.get(name);
}

for (const { repo, name, source } of consumers) {
  const srcStem = basename(source, '.scxml');
  const goldenName = normalizeName(srcStem);
  const golden = goldenFor(goldenName);
  const dest = resolve(root, '..', repo, 'test', 'fixtures', name);

  if (!check) {
    ensureDir(dirname(dest));
    writeFileSync(dest, golden);
    console.log(`generated -> ${relative(resolve(root, '..'), dest)}`);
  } else if (existsSync(dest) && readFileSync(dest, 'utf8') !== golden) {
    console.error(`STALE consumer fixture: ${relative(resolve(root, '..'), dest)}`);
    stale = true;
  }
}

if (check && stale) {
  console.error(
    '\nFixtures are out of date with the parser output. Run:  node scripts/gen-fixtures.mjs',
  );
  process.exit(1);
}

if (check) {
  console.log('OK: committed fixtures match the parser output.');
} else {
  console.log(`\nGenerated ${exampleFiles.length} golden fixture(s) + manifest.`);
}
