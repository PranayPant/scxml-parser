# SCXML Headless Core Package Extraction & Implementation Guide

This document details the step-by-step technical plan to extract the core SCXML parsing, validation, and serialization engine from the web editor codebase into a standalone, headless TypeScript package (`@your-org/scxml-parser`).

This package is designed to be 100% UI-agnostic, easily deployable as an NPM package or consumable directly via GitHub, and fully tested with 100% code path coverage.

---

## 1. Package Extraction Strategy

### A. Source Mapping & File Isolation

We isolate core AST utilities from the Next.js application layer (`src/app`, `src/components`, `src/stores`) and consolidate them into a clean TypeScript project structure:

```
@your-org/scxml-parser/
├── src/
│   ├── types/           # SCXML AST & Diagnostic type definitions
│   ├── parser/          # Raw XML -> SCXML AST conversion
│   ├── validator/       # AST structural rules & semantic checks
│   ├── serializer/      # SCXML AST -> Standard XML generation
│   ├── utils/           # Visual AST printer & string formatters
│   └── index.ts         # Public API entry point
├── tests/               # 100% path-coverage unit test suite
├── package.json
├── tsconfig.json
└── vitest.config.ts

```

### B. Extraction Checklist

1. **Copy Pure Modules:** Transfer parsing logic (`xml/`), structural validators (`src/validator/`), AST types (`src/types/`), and serializer utilities (`src/serializer/`).
2. **Strip UI Dependencies:** Remove references to Monaco Editor, DOM `window` objects, Zustand state stores, and Next.js routing.
3. **Pure Node/Browser Dependencies:** Rely strictly on `fast-xml-parser` (or native DOMParser polyfills) for XML processing.

---

## 2. Refactored Public API Design

To clarify engine responsibilities, `validateSCXML` is renamed to **`validateAST`**, highlighting that validation logic inspects in-memory AST nodes directly rather than raw XML text.

### `src/index.ts` Interface

```typescript
import { parseSCXML } from './parser';
import { validateAST } from './validator';
import { serializeSCXML } from './serializer';
import { printAST } from './utils/printer';
import type { SCXMLDocument, ValidationDiagnostic, PrintASTOptions, SerializationOptions } from './types';

export * from './types';
export { parseSCXML, validateAST, serializeSCXML, printAST };

/**
 * Unified Headless SCXML Engine
 */
export class SCXMLEngine {
  /** Parses SCXML string into an in-memory AST */
  static parse(xmlString: string): SCXMLDocument {
    return parseSCXML(xmlString);
  }

  /** Validates an in-memory AST against W3C and structural integrity rules */
  static validate(doc: SCXMLDocument): ValidationDiagnostic[] {
    return validateAST(doc);
  }

  /** Serializes an AST back to formatted SCXML XML */
  static serialize(doc: SCXMLDocument, options?: SerializationOptions): string {
    return serializeSCXML(doc, options);
  }

  /** Prints an AST hierarchy as a visual tree for debugging */
  static print(doc: SCXMLDocument, options?: PrintASTOptions): string {
    return printAST(doc, options);
  }
}

```

---

## 3. Visual AST Debugger (`printAST`)

To quickly inspect state charts, transitions, guards, and domain metadata during development or CLI execution, the engine includes a visual AST tree printer.

### Implementation Blueprint (`src/utils/printer.ts`)

```typescript
import type { SCXMLDocument, StateNode, PrintASTOptions } from '../types';

/**
 * Renders an SCXML AST as an ASCII visual tree structure for debugging.
 */
export function printAST(doc: SCXMLDocument, options: PrintASTOptions = {}): string {
  const { includeMetadata = true, includeDatamodel = true } = options;
  const lines: string[] = [];

  lines.push(`SCXML Root [initial: "${doc.initial || 'N/A'}"]`);

  // Datamodel Section
  if (includeDatamodel && doc.datamodel && doc.datamodel.length > 0) {
    lines.push(`├── 📦 <datamodel>`);
    doc.datamodel.forEach((data, idx) => {
      const isLast = idx === doc.datamodel!.length - 1 && (!doc.states || doc.states.length === 0);
      const prefix = isLast ? '│   └──' : '│   ├──';
      lines.push(`${prefix} id: "${data.id}" = ${data.expr || 'undefined'}`);
    });
  }

  // State Hierarchy Recursion
  function renderState(state: StateNode, depth: number, isLastState: boolean) {
    const indent = '│   '.repeat(depth);
    const branch = isLastState ? '└──' : '├──';
    const typeLabel = state.type ? ` [${state.type}]` : '';
    
    lines.push(`${indent}${branch} 🟢 State("${state.id}")${typeLabel}`);

    const childIndent = indent + (isLastState ? '    ' : '│   ');

    // Render Transitions
    if (state.transitions && state.transitions.length > 0) {
      state.transitions.forEach((t) => {
        const eventLabel = t.event ? `event: "${t.event}"` : 'always';
        const condLabel = t.cond ? ` [cond: ${t.cond}]` : '';
        const targetLabel = t.target ? ` ➔ ${JSON.stringify(t.target)}` : ' ➔ (internal)';
        lines.push(`${childIndent}├── ⚡ Transition(${eventLabel}${condLabel})${targetLabel}`);
      });
    }

    // Render Nested Child States
    if (state.states && state.states.length > 0) {
      state.states.forEach((child, idx) => {
        const last = idx === state.states!.length - 1;
        renderState(child, depth + 1, last);
      });
    }
  }

  // Render Root States
  if (doc.states && doc.states.length > 0) {
    doc.states.forEach((state, idx) => {
      const isLast = idx === doc.states.length - 1;
      renderState(state, 0, isLast);
    });
  }

  // Domain Metadata Summary
  if (includeMetadata && doc.metadata) {
    lines.push(`└── 🏷️  <metadata> (${doc.metadata.length} blocks present)`);
  }

  return lines.join('\n');
}

```

### Visual Debugger Output Example

```text
SCXML Root [initial: "Draft"]
├── 📦 <datamodel>
│   ├── id: "rule_is_eligible" = (Order.total > 100)
│   └── id: "user_role" = "admin"
├── 🟢 State("Draft")
│   └── ⚡ Transition(event: "SUBMIT" [cond: rule_is_eligible]) ➔ ["Processing"]
└── 🟢 State("Processing") [compound]
    ├── ⚡ Transition(event: "CANCEL") ➔ ["Draft"]
    └── 🟢 State("Evaluating")
        └── ⚡ Transition(event: "APPROVED") ➔ ["Completed"]
└── 🏷️  <metadata> (1 blocks present)

```

---

## 4. Testing & 100% Path Coverage Strategy

We enforce strict **100% branch, statement, function, and line coverage** using [Vitest](https://vitest.dev/).

### A. Vitest Configuration (`vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/types/**/*.ts', 'src/index.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});

```

### B. Comprehensive Test Suite Matrix

To guarantee 100% coverage, test cases are divided into distinct modules:

| Test Module | Coverage Objective | Key Scenarios / Edge Cases |
| --- | --- | --- |
| `tests/parser.test.ts` | Complete XML parsing paths | • Valid SCXML structures<br>

<br>• Malformed/unclosed XML tags<br>

<br>• Empty documents and missing `<scxml>` roots<br>

<br>• Parallel states, history states, and deeply nested compound states<br>

<br>• Escaped characters inside `expr` and `<script>` blocks |
| `tests/validator.test.ts` | 100% AST validation paths (`validateAST`) | • Valid state machines (0 diagnostics)<br>

<br>• Non-existent target state IDs (`ERR_INVALID_TARGET`)<br>

<br>• Duplicate state IDs across scopes (`ERR_DUPLICATE_STATE_ID`)<br>

<br>• Circular initial states & unreachable states<br>

<br>• Duplicate `<datamodel>` variable keys<br>

<br>• Time-event formatting in transition guards |
| `tests/serializer.test.ts` | Lossless round-trip generation | • `AST` $\rightarrow$ `XML` $\rightarrow$ `AST` equality verification<br>

<br>• Serialization with and without visual metadata<br>

<br>• Pretty-print indentation vs. minified string output<br>

<br>• Handling reserved XML characters in `<data>` expressions |
| `tests/printer.test.ts` | Visual debugger formatting | • Deeply nested state printing<br>

<br>• Empty transitions & condition-only transitions<br>

<br>• Printing with and without metadata/datamodel flags |

### C. Example Test Spec (`tests/validator.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { parseSCXML } from '../src/parser';
import { validateAST } from '../src/validator';

describe('validateAST Engine Diagnostics', () => {
  it('should return zero errors for a valid SCXML AST', () => {
    const xml = `
      <scxml version="1.0" initial="Idle">
        <state id="Idle">
          <transition event="START" target="Active" />
        </state>
        <state id="Active" />
      </scxml>
    `;
    const ast = parseSCXML(xml);
    const diagnostics = validateAST(ast);
    expect(diagnostics).toHaveLength(0);
  });

  it('should detect invalid transition targets', () => {
    const xml = `
      <scxml version="1.0" initial="Idle">
        <state id="Idle">
          <transition event="START" target="NonExistentState" />
        </state>
      </scxml>
    `;
    const ast = parseSCXML(xml);
    const diagnostics = validateAST(ast);
    
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('ERR_INVALID_TRANSITION_TARGET');
    expect(diagnostics[0].message).toContain('NonExistentState');
  });
});

```

---

## 5. Building, Packaging, and Consumption

### A. Packaging Configuration (`package.json`)

Configure `package.json` for Dual CommonJS/ESM module output and type definitions:

```json
{
  "name": "@your-org/scxml-parser",
  "version": "1.0.0",
  "description": "Headless SCXML parser, AST validator, and serializer library.",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc --module commonjs --outDir dist && tsc --module es2020 --outDir dist/esm && mv dist/esm/index.js dist/index.mjs",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "fast-xml-parser": "^4.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}

```

---

### B. Consuming the Package Directly from GitHub

You do not need to publish to npm immediately. You can install and consume the engine directly from your GitHub repository across any project:

```bash
# Install directly from main branch
npm install github:PranayPant/web-scxml-editor

# Install from a specific version tag or release
npm install github:PranayPant/web-scxml-editor#v1.0.0

```

### Usage in Host Applications

```typescript
import { SCXMLEngine } from '@your-org/scxml-parser';

// 1. Parse raw XML
const ast = SCXMLEngine.parse(rawXmlContent);

// 2. Validate in-memory AST
const errors = SCXMLEngine.validate(ast);
if (errors.length > 0) {
  console.error('AST Validation Errors:', errors);
}

// 3. Print AST for local debugging
console.log(SCXMLEngine.print(ast));

// 4. Mutate AST (e.g. inject Domain Rules)
ast.datamodel = ast.datamodel || [];
ast.datamodel.push({ id: 'rule_is_eligible', expr: 'Order.total > 100' });

// 5. Serialize back to XML
const finalXml = SCXMLEngine.serialize(ast, { pretty: true });

```