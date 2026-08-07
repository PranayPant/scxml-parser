#!/usr/bin/env node
/**
 * AST -> Mermaid diagram example CLI.
 *
 * Runs the parse -> validate -> toMermaid pipeline on a sample (or any)
 * SCXML file and writes a Mermaid `stateDiagram-v2` to stdout, or to a file
 * when an output path is provided via --out/-o.
 *
 * Mermaid renders natively in VS Code (Markdown preview), GitHub, Notion,
 * and Mermaid Live Editor, making it a portable way to visualize statecharts
 * from the same headless AST the rest of the library consumes.
 *
 * Usage:
 *   node examples/ast-to-mermaid.mjs <path-to.scxml>
 *   node examples/ast-to-mermaid.mjs <path-to.scxml> --out diagram.md
 *   node examples/ast-to-mermaid.mjs examples/scxml/cart-checkout.scxml
 *
 * Optional flags:
 *   -o, --out <file>     Write the diagram to <file> instead of stdout.
 *   --md                 Wrap the diagram in a ```mermaid code fence (useful
 *                        when writing directly into a Markdown file).
 *   --direction <dir>    'LR' (default) or 'TB'.
 *   --no-title           Omit the diagram title.
 *   --no-edge-labels     Omit event/condition labels on edges.
 *   -h, --help           Show this help.
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
    md: false,
    direction: null,
    noTitle: false,
    noEdgeLabels: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' || arg === '-o') {
      opts.out = argv[++i];
    } else if (arg === '--md') {
      opts.md = true;
    } else if (arg === '--direction') {
      opts.direction = argv[++i];
    } else if (arg === '--no-title') {
      opts.noTitle = true;
    } else if (arg === '--no-edge-labels') {
      opts.noEdgeLabels = true;
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
  node examples/ast-to-mermaid.mjs <path-to.scxml> [options]

Options:
  -o, --out <file>     Write the diagram to <file> instead of stdout.
  --md                 Wrap the diagram in a \`\`\`mermaid code fence.
  --direction <dir>    Diagram direction: 'LR' (default) or 'TB'.
  --no-title           Omit the diagram title.
  --no-edge-labels     Omit event/condition labels on edges.
  -h, --help           Show this help.
`);
  process.exit(0);
}

if (!opts.input) {
  console.error(
    'Error: missing input SCXML file path.\n' +
      'Usage: node examples/ast-to-mermaid.mjs <path-to.scxml> [--out <file>]',
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

// Validate the requested direction.
if (opts.direction != null && opts.direction !== 'LR' && opts.direction !== 'TB') {
  console.error(`Error: --direction must be 'LR' or 'TB', got "${opts.direction}".`);
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

// 3. Render the Mermaid state diagram.
const mermaidOptions = {
  ...(opts.direction ? { direction: opts.direction } : {}),
  ...(opts.noTitle ? { includeTitle: false } : {}),
  ...(opts.noEdgeLabels ? { includeEdgeLabels: false } : {}),
};
const diagram = SCXMLEngine.toMermaid(ast, mermaidOptions);

let output = diagram;
if (opts.md) {
  output = `\`\`\`mermaid\n${diagram}\`\`\``;
}

if (opts.out) {
  try {
    await writeFile(opts.out, `${output}\n`, 'utf8');
    console.log(`Mermaid diagram written to ${opts.out}`);
  } catch (err) {
    console.error(`Error: cannot write "${opts.out}": ${err.message}`);
    process.exit(1);
  }
} else {
  process.stdout.write(`${output}\n`);
}
