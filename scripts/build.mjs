/**
 * Build script for scxml-parser.
 *
 * Produces dual CommonJS/ESM output plus TypeScript declarations:
 *   - dist/index.js   -> CommonJS (bundled with esbuild)
 *   - dist/index.mjs  -> ESM      (bundled with esbuild)
 *   - dist/index.d.ts -> TypeScript declarations (compiled with tsc)
 *
 * Bundling inlines all internal relative imports, so the ESM output is a
 * single self-contained file that Node ESM can load without extension
 * resolution issues. Cross-platform: works on Windows, macOS, and Linux.
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { rmSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const entry = join(root, 'src', 'index.ts');

// 1. Clean previous build artifacts
rmSync(join(root, 'dist'), { recursive: true, force: true });
mkdirSync(join(root, 'dist'), { recursive: true });

// 2. Bundle CommonJS
await build({
  entryPoints: [entry],
  outfile: join(root, 'dist', 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2020',
  sourcemap: false,
  external: ['fast-xml-parser', '@opentelemetry/api'],
});

// 3. Bundle ESM
await build({
  entryPoints: [entry],
  outfile: join(root, 'dist', 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2020',
  sourcemap: false,
  external: ['fast-xml-parser', '@opentelemetry/api'],
});

// 4. Emit TypeScript declarations (declaration-only) into a temp dir, then
//    copy the full declaration tree into dist/ so relative type imports in
//    index.d.ts resolve for consumers (the JS is bundled into single files,
//    so only the .d.ts tree is needed alongside them).
const declDir = join(root, 'dist-types');
rmSync(declDir, { recursive: true, force: true });
execSync('npx tsc --emitDeclarationOnly --outDir dist-types --declarationDir dist-types', {
  cwd: root,
  stdio: 'inherit',
});

const entryDts = join(declDir, 'index.d.ts');
if (existsSync(entryDts)) {
  copyFileSync(entryDts, join(root, 'dist', 'index.d.ts'));
  // Copy the supporting declaration folders (parser, validator, serializer,
  // utils, types) referenced by index.d.ts.
  for (const sub of ['parser', 'validator', 'serializer', 'utils', 'types']) {
    const src = join(declDir, sub);
    if (existsSync(src)) {
      const destDir = join(root, 'dist', sub);
      mkdirSync(destDir, { recursive: true });
      for (const f of readDirRec(src)) {
        if (f.endsWith('.d.ts')) {
          copyFileSync(join(src, f), join(destDir, f));
        }
      }
    }
  }
}

rmSync(declDir, { recursive: true, force: true });

console.log('Build complete: dist/index.js (CJS), dist/index.mjs (ESM), dist/*.d.ts (types)');

/**
 * Recursively lists files (relative paths) under a directory.
 */
function readDirRec(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      for (const sub of readDirRec(full)) {
        results.push(join(entry, sub));
      }
    } else {
      results.push(entry);
    }
  }
  return results;
}
