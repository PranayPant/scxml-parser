#!/usr/bin/env node
/**
 * AST print example CLI.
 *
 * Runs the parse -> validate -> print pipeline on a sample (or any) SCXML
 * file and writes the visual AST tree to stdout, or to a file when an
 * output path is provided via --out/-o.
 *
 * Usage:
 *   node examples/ast-print.mjs <path-to.scxml>
 *   node examples/ast-print.mjs <path-to.scxml> --out ast.txt
 *   node examples/ast-print.mjs examples/scxml/cart-checkout.scxml
 *
 * Optional print flags (see PrintASTOptions):
 *   --no-metadata      hide domain metadata blocks
 *   --no-datamodel     hide the datamodel section
 *   --no-transitions   hide transitions on each state
 *   --include-exec     include executable content detail
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Resolve the built library (ESM bundle) relative to this script's folder.
// Use a file:// URL so dynamic import works on Windows drive paths.
const here = dirname(fileURLToPath(import.meta.url));
const libraryPath = join(here, '..', 'dist', 'index.mjs');
const { SCXMLEngine } = await import(pathToFileURL(libraryPath).href);

/** Parse CLI args into a config object. */
function parseArgs(argv) {
  const positional = [];
  const opts = {
    out: null,
    printOptions: {},
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' || arg === '-o') {
      opts.out = argv[++i];
    } else if (arg === '--no-metadata') {
      opts.printOptions.includeMetadata = false;
    } else if (arg === '--no-datamodel') {
      opts.printOptions.includeDatamodel = false;
    } else if (arg === '--no-transitions') {
      opts.printOptions.includeTransitions = false;
    } else if (arg === '--include-exec') {
      opts.printOptions.includeExecutable = true;
    } else if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }
  opts.input = positional[0];
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  console.log(`
Usage:
  node examples/ast-print.mjs <path-to.scxml> [options]

Options:
  -o, --out <file>      Write the AST output to <file> instead of stdout.
  --no-metadata         Hide domain metadata blocks.
  --no-datamodel        Hide the datamodel section.
  --no-transitions      Hide transitions on each state.
  --include-exec        Include executable content detail.
  -h, --help            Show this help.
`);
  process.exit(0);
}

if (!opts.input) {
  console.error(
    'Error: missing input SCXML file path.\n' +
      'Usage: node examples/ast-print.mjs <path-to.scxml> [--out <file>]',
  );
  process.exit(1);
}

let xml;
try {
  xml = await readFile(opts.input, 'utf8');
} catch (err) {
  console.error(`Error: cannot read "${opts.input}": ${err.message}`);
  process.exit(1);
}

// 1. Parse raw SCXML into an AST.
const result = SCXMLEngine.parse(xml);
if (!result.success) {
  console.error(`Parse failed for ${opts.input}:`);
  for (const d of result.errors) {
    const loc = d.line != null ? ` @ ${d.line}:${d.column ?? 0}` : '';
    console.error(`  [${d.code ?? 'ERR'}] ${d.severity}${loc}: ${d.message}`);
  }
  process.exit(1);
}

const ast = result.data;

// 2. Validate the AST and surface any diagnostics.
const diagnostics = SCXMLEngine.validate(ast);
if (diagnostics.length > 0) {
  console.warn(`\nValidation diagnostics for ${opts.input}:`);
  for (const d of diagnostics) {
    console.warn(`  [${d.code ?? '-'}] ${d.severity}: ${d.message}`);
  }
  console.warn('');
}

// 3. Render the visual AST tree.
const output = SCXMLEngine.print(ast, opts.printOptions);

if (opts.out) {
  try {
    await writeFile(opts.out, `${output}\n`, 'utf8');
    console.log(`AST written to ${opts.out}`);
  } catch (err) {
    console.error(`Error: cannot write "${opts.out}": ${err.message}`);
    process.exit(1);
  }
} else {
  process.stdout.write(`${output}\n`);
}
